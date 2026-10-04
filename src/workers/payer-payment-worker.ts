import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import {
  auditEvents,
  ledgerAccounts,
  nwcConnections,
  outboxEvents,
  payerPaymentAuthorizations,
  receivables,
  scheduledPaymentAttempts,
} from "@/db/schema";
import { recordLedgerTransaction } from "@/db/repositories/ledger-repository";
import { assertPaymentAttemptAllowed, safeNwcFailureReason } from "@/domain/payer-payment";
import { decryptNwcSecret } from "@/integrations/nwc/secret-crypto";
import { readNwcPrivateRelayUrls } from "@/integrations/nwc/private-metadata";
import type { NwcGateway } from "@/integrations/nwc/types";
import type { SettlementInvoiceGateway } from "@/integrations/lightning/settlement-invoice-gateway";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

async function ensureSettlementAccounts<THKT extends PgQueryResultHKT>(db: Database<THKT>, receivableId: string) {
  const assetId = `payer-settlement-asset:${receivableId}`;
  const clearingId = `payer-settlement-clearing:${receivableId}`;
  await db.insert(ledgerAccounts).values([
    { id: assetId, code: `PAYER_SETTLEMENT_ASSET:${receivableId}`, asset: "BTC", ownerType: "PAYER_SETTLEMENT", ownerId: receivableId },
    { id: clearingId, code: `PAYER_SETTLEMENT_CLEARING:${receivableId}`, asset: "BTC", ownerType: "POOL", ownerId: receivableId },
  ]).onConflictDoNothing();
  return { assetId, clearingId };
}

export async function runDuePayerPayment<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  dependencies: { nwc: NwcGateway; invoices: SettlementInvoiceGateway },
  input: { authorizationId: string; now: Date },
) {
  const [row] = await db.select({ authorization: payerPaymentAuthorizations, receivable: receivables })
    .from(payerPaymentAuthorizations)
    .innerJoin(receivables, eq(receivables.id, payerPaymentAuthorizations.receivableId))
    .where(eq(payerPaymentAuthorizations.id, input.authorizationId))
    .limit(1);
  if (!row) throw new Error("PAYMENT_AUTHORIZATION_NOT_FOUND");
  const idempotencyKey = `payer-payment:${row.authorization.id}`;
  const [existing] = await db.select().from(scheduledPaymentAttempts)
    .where(eq(scheduledPaymentAttempts.idempotencyKey, idempotencyKey)).limit(1);
  if (existing) return { status: existing.status, duplicate: true, invoice: existing.invoiceReference };
  if (row.receivable.status !== "DUE") throw new Error("RECEIVABLE_NOT_DUE");
  assertPaymentAttemptAllowed({
    amountMsat: row.authorization.maxAmountMsat,
    maxAmountMsat: row.authorization.maxAmountMsat,
    now: input.now,
    scheduledFor: row.authorization.scheduledFor,
    expiresAt: row.authorization.expiresAt,
    status: row.authorization.status,
    usedAt: row.authorization.usedAt,
    revokedAt: row.authorization.revokedAt,
  });
  const invoice = await dependencies.invoices.createInvoice({
    idempotencyKey,
    amountMsat: row.authorization.maxAmountMsat,
    description: `Pagamento do recebível ${row.receivable.id}`,
    expiresAt: row.authorization.expiresAt,
  });
  const attemptId = randomUUID();
  const [created] = await db.insert(scheduledPaymentAttempts).values({
    id: attemptId,
    authorizationId: row.authorization.id,
    invoiceId: invoice.id,
    invoiceReference: invoice.bolt11,
    invoicePaymentHash: invoice.paymentHash,
    idempotencyKey,
    scheduledFor: row.authorization.scheduledFor,
    attemptedAt: input.now,
    status: "INVOICE_CREATED",
  }).onConflictDoNothing({ target: scheduledPaymentAttempts.idempotencyKey }).returning();
  if (!created) {
    const [duplicate] = await db.select().from(scheduledPaymentAttempts).where(eq(scheduledPaymentAttempts.idempotencyKey, idempotencyKey));
    return { status: duplicate?.status ?? "UNKNOWN", duplicate: true, invoice: duplicate?.invoiceReference ?? null };
  }

  if (row.authorization.method === "MANUAL") {
    await db.insert(outboxEvents).values({ id: randomUUID(), topic: "payer.manual_payment.available", aggregateType: "PAYER_PAYMENT_AUTHORIZATION", aggregateId: row.authorization.id, payload: { authorizationPublicId: row.authorization.publicId } });
    return { status: "MANUAL_PAYMENT_REQUIRED" as const, duplicate: false, invoice: invoice.bolt11 };
  }

  const [connection] = await db.select().from(nwcConnections).where(and(
    eq(nwcConnections.authorizationId, row.authorization.id),
    eq(nwcConnections.status, "ACTIVE"),
  )).limit(1);
  if (!connection) {
    await db.transaction(async (tx) => {
      await tx.update(scheduledPaymentAttempts).set({ status: "FAILED", failureCode: "UNAUTHORIZED", failureReasonSafe: safeNwcFailureReason("UNAUTHORIZED"), updatedAt: input.now }).where(eq(scheduledPaymentAttempts.id, attemptId));
      await tx.update(payerPaymentAuthorizations).set({ status: "MANUAL_PAYMENT_REQUIRED", updatedAt: input.now }).where(eq(payerPaymentAuthorizations.id, row.authorization.id));
    });
    return { status: "MANUAL_PAYMENT_REQUIRED" as const, duplicate: false, invoice: invoice.bolt11 };
  }

  await db.transaction(async (tx) => {
    await tx.update(scheduledPaymentAttempts).set({ status: "REQUEST_SENT", updatedAt: input.now }).where(eq(scheduledPaymentAttempts.id, attemptId));
    await tx.update(payerPaymentAuthorizations).set({ status: "PAYMENT_PENDING", updatedAt: input.now }).where(eq(payerPaymentAuthorizations.id, row.authorization.id));
  });
  const payment = await dependencies.nwc.payInvoice({
    connection: {
      walletServicePubkey: connection.walletServicePubkey,
      relayUrls: readNwcPrivateRelayUrls(connection),
      secret: decryptNwcSecret(connection.encryptedConnectionSecret),
    },
    invoice: invoice.bolt11,
    amountMsat: invoice.amountMsat,
    maxFeeMsat: row.authorization.maxFeeMsat,
    expiresAt: invoice.expiresAt,
  });

  if (payment.status === "UNKNOWN") {
    await db.update(scheduledPaymentAttempts).set({ status: "UNKNOWN", nwcRequestEventId: payment.requestEventId, failureCode: payment.code, failureReasonSafe: safeNwcFailureReason(payment.code), updatedAt: input.now }).where(eq(scheduledPaymentAttempts.id, attemptId));
    return { status: "UNKNOWN" as const, duplicate: false, invoice: invoice.bolt11 };
  }
  if (payment.status === "FAILED") {
    await db.transaction(async (tx) => {
      await tx.update(scheduledPaymentAttempts).set({ status: "FAILED", nwcRequestEventId: payment.requestEventId, nwcResponseEventId: payment.responseEventId, failureCode: payment.code, failureReasonSafe: safeNwcFailureReason(payment.code), updatedAt: input.now }).where(eq(scheduledPaymentAttempts.id, attemptId));
      await tx.update(payerPaymentAuthorizations).set({ status: "MANUAL_PAYMENT_REQUIRED", updatedAt: input.now }).where(eq(payerPaymentAuthorizations.id, row.authorization.id));
      await tx.insert(outboxEvents).values({ id: randomUUID(), topic: "payer.manual_payment.required", aggregateType: "PAYER_PAYMENT_AUTHORIZATION", aggregateId: row.authorization.id, payload: { authorizationPublicId: row.authorization.publicId, reasonCode: payment.code } });
    });
    return { status: "MANUAL_PAYMENT_REQUIRED" as const, duplicate: false, invoice: invoice.bolt11 };
  }

  const amountSats = invoice.amountMsat / 1_000n;
  if (invoice.amountMsat % 1_000n !== 0n || amountSats <= 0n) throw new Error("INVOICE_AMOUNT_NOT_WHOLE_SATS");
  const accounts = await ensureSettlementAccounts(db, row.receivable.id);
  await recordLedgerTransaction(db, {
    id: randomUUID(),
    idempotencyKey: `ledger:${idempotencyKey}`,
    correlationId: idempotencyKey,
    description: "Pagamento do recebível recebido via NWC",
    postings: [
      { accountId: accounts.assetId, asset: "BTC", amount: amountSats },
      { accountId: accounts.clearingId, asset: "BTC", amount: -amountSats },
    ],
  });
  await db.transaction(async (tx) => {
    await tx.update(scheduledPaymentAttempts).set({
      status: "SETTLED", nwcRequestEventId: payment.requestEventId,
      nwcResponseEventId: payment.responseEventId, feesPaidMsat: payment.feesPaidMsat,
      preimageHash: createHash("sha256").update(payment.preimage).digest("hex"), updatedAt: input.now,
    }).where(eq(scheduledPaymentAttempts.id, attemptId));
    await tx.update(payerPaymentAuthorizations).set({ status: "PAID", usedAt: input.now, updatedAt: input.now }).where(eq(payerPaymentAuthorizations.id, row.authorization.id));
    await tx.update(receivables).set({ status: "PAID", updatedAt: input.now }).where(eq(receivables.id, row.receivable.id));
    await tx.insert(auditEvents).values({ id: randomUUID(), action: "PAYER_PAYMENT_SETTLED", targetType: "PAYER_PAYMENT_AUTHORIZATION", targetId: row.authorization.id, correlationId: idempotencyKey, after: { amountSats: amountSats.toString(), feesPaidMsat: payment.feesPaidMsat.toString() } });
  });
  return { status: "SETTLED" as const, duplicate: false, invoice: invoice.bolt11 };
}

export async function runDuePayerPayments<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, dependencies: { nwc: NwcGateway; invoices: SettlementInvoiceGateway }, now: Date,
) {
  const due = await db.select({ id: payerPaymentAuthorizations.id }).from(payerPaymentAuthorizations).where(and(
    inArray(payerPaymentAuthorizations.status, ["ACTIVE", "MANUAL_PAYMENT_REQUIRED"]),
    lte(payerPaymentAuthorizations.scheduledFor, now),
  )).limit(50);
  const results = [];
  for (const authorization of due) {
    results.push(await runDuePayerPayment(db, dependencies, { authorizationId: authorization.id, now }));
  }
  return results;
}
