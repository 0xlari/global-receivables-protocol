import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import {
  auditEvents,
  clientConfirmations,
  nwcConnections,
  payerPaymentAuthorizations,
  receivables,
  scheduledPaymentAttempts,
} from "@/db/schema";
import { DomainError } from "@/domain/errors";
import { hashConfirmationToken } from "@/domain/confirmation-token";
import type { PayerPaymentMethod } from "@/domain/payer-payment";
import { decryptNwcSecret, encryptNwcSecret } from "@/integrations/nwc/secret-crypto";
import { encryptNwcPrivateMetadata, readNwcPrivateRelayUrls } from "@/integrations/nwc/private-metadata";
import type { NwcGateway } from "@/integrations/nwc/types";
import { fingerprintNwcConnection, parseNwcUri } from "@/integrations/nwc/uri";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const managementToken = () => randomBytes(32).toString("base64url");

function invalidAccess(): never {
  throw new DomainError("Autorização não encontrada ou acesso inválido.", "PAYMENT_AUTHORIZATION_ACCESS_DENIED");
}

async function authorizationForManagement<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, publicId: string, rawManagementToken: string,
) {
  const [row] = await db.select().from(payerPaymentAuthorizations).where(and(
    eq(payerPaymentAuthorizations.publicId, publicId),
    eq(payerPaymentAuthorizations.managementTokenHash, hash(rawManagementToken)),
  )).limit(1);
  return row ?? invalidAccess();
}

export async function createPayerPaymentAuthorization<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    receivableId: string;
    rawConfirmationToken: string;
    method: PayerPaymentMethod;
    maxAmountMsat: bigint;
    maxFeeMsat: bigint;
    now: Date;
  },
) {
  if (input.maxAmountMsat <= 0n || input.maxAmountMsat > 5_000_000_000n) {
    throw new DomainError("Valor máximo inválido.", "INVALID_PAYMENT_LIMIT");
  }
  if (input.maxFeeMsat < 0n || input.maxFeeMsat > input.maxAmountMsat / 20n) {
    throw new DomainError("Limite de tarifa inválido.", "INVALID_FEE_LIMIT");
  }
  const token = managementToken();
  let tokenHash: string;
  try {
    tokenHash = hashConfirmationToken(input.rawConfirmationToken);
  } catch {
    invalidAccess();
  }
  return db.transaction(async (tx) => {
    const [resource] = await tx
      .select({ confirmation: clientConfirmations, receivable: receivables })
      .from(clientConfirmations)
      .innerJoin(receivables, eq(receivables.id, clientConfirmations.receivableId))
      .where(and(
        eq(clientConfirmations.tokenHash, tokenHash),
        eq(clientConfirmations.receivableId, input.receivableId),
      ))
      .for("update");
    if (!resource || resource.confirmation.status !== "ACCEPTED" || !resource.confirmation.usedAt) invalidAccess();
    if (resource.receivable.clientAcceptedBtc !== true) {
      throw new DomainError("O pagamento em BTC não foi aceito.", "BTC_PAYMENT_NOT_ACCEPTED");
    }
    if (resource.receivable.dueAt <= input.now) {
      throw new DomainError("O vencimento precisa estar no futuro.", "INVALID_PAYMENT_SCHEDULE");
    }
    const id = randomUUID();
    const publicId = randomUUID();
    const expiresAt = new Date(resource.receivable.dueAt.getTime() + 3 * 86_400_000);
    const status = input.method === "MANUAL" ? "MANUAL_PAYMENT_REQUIRED" : "PENDING_CONNECTION";
    const [created] = await tx.insert(payerPaymentAuthorizations).values({
      id,
      publicId,
      receivableId: resource.receivable.id,
      payerId: resource.receivable.clientId,
      confirmationId: resource.confirmation.id,
      managementTokenHash: hash(token),
      method: input.method,
      status,
      maxAmountMsat: input.maxAmountMsat,
      maxFeeMsat: input.maxFeeMsat,
      scheduledFor: resource.receivable.dueAt,
      expiresAt,
    }).onConflictDoNothing({ target: payerPaymentAuthorizations.receivableId }).returning();
    if (!created) throw new DomainError("A forma de pagamento já foi escolhida.", "PAYMENT_AUTHORIZATION_EXISTS");
    await tx.insert(auditEvents).values({
      id: randomUUID(), action: "PAYER_PAYMENT_AUTHORIZATION_CREATED",
      targetType: "PAYER_PAYMENT_AUTHORIZATION", targetId: id,
      correlationId: randomUUID(), after: { method: input.method, status, maxAmountMsat: input.maxAmountMsat.toString(), maxFeeMsat: input.maxFeeMsat.toString() },
    });
    return { publicId, managementToken: token, status, method: input.method, scheduledFor: resource.receivable.dueAt, expiresAt };
  });
}

export async function connectNwcAuthorization<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, gateway: NwcGateway,
  input: { publicId: string; managementToken: string; nwcUri: string; now: Date; protectRelayMetadata?: boolean },
) {
  const authorization = await authorizationForManagement(db, input.publicId, input.managementToken);
  if (authorization.method !== "NWC_AUTOMATIC" || !["PENDING_CONNECTION", "INVALID"].includes(authorization.status)) {
    throw new DomainError("Esta autorização não aceita uma conexão NWC.", "INVALID_PAYMENT_AUTHORIZATION_STATE");
  }
  if (authorization.expiresAt <= input.now || authorization.revokedAt) {
    throw new DomainError("Autorização expirada ou revogada.", "INVALID_PAYMENT_AUTHORIZATION_STATE");
  }
  const connection = parseNwcUri(input.nwcUri);
  const info = await gateway.getInfo(connection);
  if (!info.methods.includes("pay_invoice")) {
    throw new DomainError("A conexão não permite pay_invoice.", "NWC_PAY_INVOICE_UNSUPPORTED");
  }
  const encryptedSecret = encryptNwcSecret(connection.secret);
  const encryptedConnectionMetadata = input.protectRelayMetadata ? encryptNwcPrivateMetadata(connection.relayUrls) : null;
  const fingerprint = fingerprintNwcConnection(connection);
  await db.transaction(async (tx) => {
    const [conflicting] = await tx.select({ authorizationId: nwcConnections.authorizationId })
      .from(nwcConnections)
      .where(eq(nwcConnections.connectionFingerprint, fingerprint))
      .limit(1);
    if (conflicting && conflicting.authorizationId !== authorization.id) {
      throw new DomainError("Esta carteira NWC já está conectada a outra autorização.", "NWC_CONNECTION_ALREADY_IN_USE");
    }
    await tx.insert(nwcConnections).values({
      id: randomUUID(), authorizationId: authorization.id,
      walletServicePubkey: connection.walletServicePubkey,
      relayUrls: input.protectRelayMetadata ? [] : connection.relayUrls,
      encryptedConnectionSecret: encryptedSecret,
      encryptedConnectionMetadata,
      connectionFingerprint: fingerprint,
      supportedMethods: info.methods,
      lastCheckedAt: input.now,
      status: "ACTIVE",
    }).onConflictDoUpdate({
      target: nwcConnections.authorizationId,
      set: {
        walletServicePubkey: connection.walletServicePubkey,
        relayUrls: input.protectRelayMetadata ? [] : connection.relayUrls,
        encryptedConnectionSecret: encryptedSecret,
        encryptedConnectionMetadata,
        connectionFingerprint: fingerprint,
        supportedMethods: info.methods,
        lastCheckedAt: input.now,
        status: "ACTIVE",
        revokedAt: null,
        updatedAt: input.now,
      },
    });
    await tx.update(payerPaymentAuthorizations).set({ status: "ACTIVE", updatedAt: input.now }).where(eq(payerPaymentAuthorizations.id, authorization.id));
    await tx.insert(auditEvents).values({
      id: randomUUID(), action: "NWC_CONNECTION_VALIDATED", targetType: "PAYER_PAYMENT_AUTHORIZATION",
      targetId: authorization.id, correlationId: randomUUID(), after: { fingerprint, methods: info.methods },
    });
  });
  return { status: "ACTIVE" as const, supportedMethods: info.methods, fingerprint, receivableId: authorization.receivableId, environment: "SIMULATION" as const };
}

export async function readPayerPaymentAuthorization<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, publicId: string, rawManagementToken: string,
) {
  const authorization = await authorizationForManagement(db, publicId, rawManagementToken);
  const [connection] = await db.select({
    walletServicePubkey: nwcConnections.walletServicePubkey,
    connectionFingerprint: nwcConnections.connectionFingerprint,
    supportedMethods: nwcConnections.supportedMethods,
    status: nwcConnections.status,
    lastCheckedAt: nwcConnections.lastCheckedAt,
  }).from(nwcConnections).where(eq(nwcConnections.authorizationId, authorization.id)).limit(1);
  const [attempt] = await db.select({
    status: scheduledPaymentAttempts.status,
    invoice: scheduledPaymentAttempts.invoiceReference,
    failureReason: scheduledPaymentAttempts.failureReasonSafe,
  }).from(scheduledPaymentAttempts).where(eq(scheduledPaymentAttempts.authorizationId, authorization.id)).limit(1);
  return {
    publicId: authorization.publicId,
    method: authorization.method,
    status: authorization.status,
    maxAmountMsat: authorization.maxAmountMsat.toString(),
    maxFeeMsat: authorization.maxFeeMsat.toString(),
    scheduledFor: authorization.scheduledFor,
    expiresAt: authorization.expiresAt,
    usedAt: authorization.usedAt,
    revokedAt: authorization.revokedAt,
    connection: connection ? {
      walletService: `${connection.walletServicePubkey.slice(0, 8)}…${connection.walletServicePubkey.slice(-8)}`,
      fingerprint: connection.connectionFingerprint,
      supportedMethods: connection.supportedMethods,
      status: connection.status,
      lastCheckedAt: connection.lastCheckedAt,
    } : null,
    manualPayment: attempt ? {
      status: attempt.status,
      invoice: attempt.invoice,
      lightningUri: attempt.invoice ? `lightning:${attempt.invoice}` : null,
      failureReason: attempt.failureReason,
    } : null,
    environment: "SIMULATION" as const,
  };
}

export async function validateStoredNwcAuthorization<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, gateway: NwcGateway,
  input: { publicId: string; managementToken: string; now: Date },
) {
  const authorization = await authorizationForManagement(db, input.publicId, input.managementToken);
  const [stored] = await db.select().from(nwcConnections).where(eq(nwcConnections.authorizationId, authorization.id)).limit(1);
  if (!stored || stored.status === "REVOKED") invalidAccess();
  const secret = decryptNwcSecret(stored.encryptedConnectionSecret);
  const info = await gateway.getInfo({
    walletServicePubkey: stored.walletServicePubkey,
    relayUrls: readNwcPrivateRelayUrls(stored),
    secret,
  });
  const valid = info.methods.includes("pay_invoice");
  await db.transaction(async (tx) => {
    await tx.update(nwcConnections).set({ status: valid ? "ACTIVE" : "INVALID", supportedMethods: info.methods, lastCheckedAt: input.now, updatedAt: input.now }).where(eq(nwcConnections.id, stored.id));
    await tx.update(payerPaymentAuthorizations).set({ status: valid ? "ACTIVE" : "INVALID", updatedAt: input.now }).where(eq(payerPaymentAuthorizations.id, authorization.id));
  });
  if (!valid) throw new DomainError("A conexão não permite pay_invoice.", "NWC_PAY_INVOICE_UNSUPPORTED");
  return { status: "ACTIVE" as const, supportedMethods: info.methods };
}

export async function revokePayerPaymentAuthorization<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, input: { publicId: string; managementToken: string; now: Date },
) {
  const authorization = await authorizationForManagement(db, input.publicId, input.managementToken);
  if (authorization.status === "PAID") {
    throw new DomainError("Pagamento já concluído.", "PAYMENT_ALREADY_USED");
  }
  await db.transaction(async (tx) => {
    await tx.update(payerPaymentAuthorizations).set({ status: "REVOKED", revokedAt: input.now, updatedAt: input.now }).where(eq(payerPaymentAuthorizations.id, authorization.id));
    await tx.update(nwcConnections).set({ status: "REVOKED", revokedAt: input.now, updatedAt: input.now }).where(eq(nwcConnections.authorizationId, authorization.id));
    await tx.insert(auditEvents).values({ id: randomUUID(), action: "PAYER_PAYMENT_AUTHORIZATION_REVOKED", targetType: "PAYER_PAYMENT_AUTHORIZATION", targetId: authorization.id, correlationId: randomUUID() });
  });
  return { status: "REVOKED" as const };
}

export async function switchPayerPaymentToManual<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, input: { publicId: string; managementToken: string; now: Date },
) {
  const authorization = await authorizationForManagement(db, input.publicId, input.managementToken);
  if (["PAYMENT_PENDING", "PAID", "REVOKED", "EXPIRED"].includes(authorization.status)) {
    throw new DomainError("A forma de pagamento não pode mais ser alterada.", "INVALID_PAYMENT_AUTHORIZATION_STATE");
  }
  await db.transaction(async (tx) => {
    await tx.update(payerPaymentAuthorizations).set({ method: "MANUAL", status: "MANUAL_PAYMENT_REQUIRED", updatedAt: input.now }).where(eq(payerPaymentAuthorizations.id, authorization.id));
    await tx.update(nwcConnections).set({ status: "REVOKED", revokedAt: input.now, updatedAt: input.now }).where(eq(nwcConnections.authorizationId, authorization.id));
    await tx.insert(auditEvents).values({ id: randomUUID(), action: "PAYER_PAYMENT_SWITCHED_TO_MANUAL", targetType: "PAYER_PAYMENT_AUTHORIZATION", targetId: authorization.id, correlationId: randomUUID() });
  });
  return { method: "MANUAL" as const, status: "MANUAL_PAYMENT_REQUIRED" as const };
}
