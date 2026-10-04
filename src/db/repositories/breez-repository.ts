import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import {
  contributionIntents,
  externalPaymentEvents,
  externalPaymentRequests,
  externalSwapAttempts,
  ledgerAccounts,
  ledgerEntries,
  mainnetSessions,
  pools,
  reconciliationRuns,
  mainnetCircuitBreakerEvents,
  mainnetDemoApprovals,
  mainnetDemoRuns,
  mainnetReadinessAudits,
} from "@/db/schema";
import { triggerMainnetCircuitBreaker } from "@/db/repositories/mainnet-demo-repository";
import { recordLedgerTransaction } from "@/db/repositories/ledger-repository";
import { allocateContribution } from "@/db/repositories/pool-repository";
import { DomainError } from "@/domain/errors";
import {
  MAINNET_LBTC_ASSET_ID,
  MAINNET_MAX_HOT_WALLET_SATS,
  MAINNET_MAX_INVOICE_SATS,
  MAINNET_MAX_SESSION_SATS,
  MAINNET_USDT_ASSET_ID,
} from "@/integrations/breez/config";
import type {
  BreezLiquidGateway,
  BreezPaymentEvent,
  PreparedAssetSwap,
} from "@/integrations/breez/types";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

function eventHash(event: BreezPaymentEvent) {
  return createHash("sha256")
    .update(`${event.eventType}|${event.externalReference}|${event.state}|${event.amountSats}|${event.feesSats}|${event.occurredAt.toISOString()}`)
    .digest("hex");
}

async function ensureMainnetLedgerAccounts<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  poolId: string,
) {
  const walletAccountId = "breez-mainnet-wallet-btc";
  const poolAccountId = `pool-principal-btc:${poolId}`;
  await db.insert(ledgerAccounts).values([
    { id: walletAccountId, code: "BREEZ_MAINNET_WALLET", asset: "BTC", ownerType: "BREEZ_MAINNET_WALLET" },
    { id: poolAccountId, code: `POOL_PRINCIPAL:${poolId}`, asset: "BTC", ownerType: "POOL", ownerId: poolId },
  ]).onConflictDoNothing();
  return { walletAccountId, poolAccountId };
}

export async function createMainnetContributionInvoice<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  gateway: BreezLiquidGateway,
  input: {
    requestId: string;
    intentId: string;
    sessionId: string;
    demoRunId: string;
    idempotencyKey: string;
    description: string;
    now: Date;
  },
) {
  if (input.sessionId !== input.demoRunId) throw new DomainError("Sessão financeira deve pertencer à demo ativa.", "MAINNET_DEMO_SESSION_MISMATCH");
  const [preexisting] = await db.select().from(externalPaymentRequests).where(eq(externalPaymentRequests.idempotencyKey, input.idempotencyKey)).limit(1);
  if (preexisting) {
    if (preexisting.intentId !== input.intentId || preexisting.sessionId !== input.sessionId) throw new DomainError("Chave idempotente reutilizada em outra invoice.", "IDEMPOTENCY_CONFLICT");
    if (preexisting.status === "PENDING" || preexisting.status === "SETTLED") return { requestId: preexisting.id, invoice: preexisting.destination, duplicate: true };
    throw new DomainError("Invoice anterior requer conciliação antes de retry.", "BREEZ_RESULT_UNKNOWN");
  }
  const [preAuthorization] = await db.select({ run: mainnetDemoRuns, audit: mainnetReadinessAudits, approval: mainnetDemoApprovals })
    .from(mainnetDemoRuns)
    .innerJoin(mainnetReadinessAudits, eq(mainnetReadinessAudits.id, mainnetDemoRuns.readinessAuditId))
    .innerJoin(mainnetDemoApprovals, eq(mainnetDemoApprovals.demoRunId, mainnetDemoRuns.id))
    .where(eq(mainnetDemoRuns.id, input.demoRunId))
    .limit(1);
  if (!preAuthorization || preAuthorization.run.status !== "ACTIVE" || preAuthorization.audit.status !== "GO" || !preAuthorization.audit.allChecksPassed) throw new DomainError("Demo mainnet não está ativa e aprovada.", "MAINNET_DEMO_NOT_AUTHORIZED");
  if (preAuthorization.approval.revokedAt || preAuthorization.approval.expiresAt <= input.now || preAuthorization.approval.approvedAt > input.now) throw new DomainError("Aprovação da demo expirou ou foi revogada.", "MAINNET_DEMO_APPROVAL_INVALID");
  const balances = await gateway.getBalances();
  if (balances.btcSats > MAINNET_MAX_HOT_WALLET_SATS) throw new DomainError("Carteira quente excede 10.000 sats.", "BREEZ_HOT_WALLET_LIMIT_EXCEEDED");
  const reservation = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(externalPaymentRequests).where(eq(externalPaymentRequests.idempotencyKey, input.idempotencyKey)).for("update");
    if (existing) {
      if (existing.intentId !== input.intentId || existing.sessionId !== input.sessionId) {
        throw new DomainError("Chave idempotente reutilizada em outra invoice.", "IDEMPOTENCY_CONFLICT");
      }
      if (existing.status === "PENDING" || existing.status === "SETTLED") return { kind: "existing" as const, existing };
      throw new DomainError("Invoice anterior requer conciliação antes de retry.", "BREEZ_RESULT_UNKNOWN");
    }

    const [authorization] = await tx.select({ run: mainnetDemoRuns, audit: mainnetReadinessAudits, approval: mainnetDemoApprovals }).from(mainnetDemoRuns).innerJoin(mainnetReadinessAudits, eq(mainnetReadinessAudits.id, mainnetDemoRuns.readinessAuditId)).innerJoin(mainnetDemoApprovals, eq(mainnetDemoApprovals.demoRunId, mainnetDemoRuns.id)).where(eq(mainnetDemoRuns.id, input.demoRunId)).for("update");
    if (!authorization || authorization.run.status !== "ACTIVE" || authorization.audit.status !== "GO" || !authorization.audit.allChecksPassed) throw new DomainError("Demo mainnet não está ativa e aprovada.", "MAINNET_DEMO_NOT_AUTHORIZED");
    if (!authorization.approval || authorization.approval.revokedAt || authorization.approval.expiresAt <= input.now || authorization.approval.approvedAt > input.now) throw new DomainError("Aprovação da demo expirou ou foi revogada.", "MAINNET_DEMO_APPROVAL_INVALID");
    const [breaker] = await tx.select({ id: mainnetCircuitBreakerEvents.id }).from(mainnetCircuitBreakerEvents).where(eq(mainnetCircuitBreakerEvents.demoRunId, input.demoRunId)).limit(1);
    if (breaker) throw new DomainError("Circuit breaker da demo está acionado.", "MAINNET_DEMO_CIRCUIT_OPEN");
    const [activeInvoice] = await tx.select({ id: externalPaymentRequests.id }).from(externalPaymentRequests).where(and(eq(externalPaymentRequests.environment, "MAINNET"), inArray(externalPaymentRequests.status, ["PREPARING", "PENDING"]))).limit(1);
    if (activeInvoice) throw new DomainError("Já existe uma invoice mainnet ativa.", "MAINNET_DEMO_INVOICE_ALREADY_ACTIVE");

    const [intent] = await tx
      .select({ intent: contributionIntents, poolEnvironment: pools.environment })
      .from(contributionIntents)
      .innerJoin(pools, eq(pools.id, contributionIntents.poolId))
      .where(eq(contributionIntents.id, input.intentId))
      .for("update");
    if (!intent || intent.poolEnvironment !== "MAINNET" || intent.intent.status !== "CREATED") {
      throw new DomainError("Intenção não está pronta para invoice mainnet.", "MAINNET_INTENT_NOT_READY");
    }
    if (intent.intent.amount > MAINNET_MAX_INVOICE_SATS) {
      throw new DomainError("Invoice excede 1.000 sats.", "BREEZ_MAINNET_LIMIT_EXCEEDED");
    }
    await tx.insert(mainnetSessions).values({ id: input.sessionId, requestedAmountSats: 0n, maxAmountSats: MAINNET_MAX_SESSION_SATS }).onConflictDoNothing();
    await tx.select().from(mainnetSessions).where(eq(mainnetSessions.id, input.sessionId)).for("update");
    const session = await tx.update(mainnetSessions).set({ requestedAmountSats: sql`${mainnetSessions.requestedAmountSats} + ${intent.intent.amount}`, updatedAt: input.now }).where(and(
      eq(mainnetSessions.id, input.sessionId),
      lte(sql`${mainnetSessions.requestedAmountSats} + ${intent.intent.amount}`, mainnetSessions.maxAmountSats),
    )).returning({ requestedAmountSats: mainnetSessions.requestedAmountSats });
    if (session.length !== 1) {
      throw new DomainError("Sessão excede 5.000 sats.", "BREEZ_MAINNET_SESSION_LIMIT_EXCEEDED");
    }
    await tx.insert(externalPaymentRequests).values({
      id: input.requestId,
      intentId: input.intentId,
      sessionId: input.sessionId,
      idempotencyKey: input.idempotencyKey,
      environment: "MAINNET",
      purpose: "CONTRIBUTION",
      expectedAsset: "BTC",
      expectedAmount: intent.intent.amount,
      status: "PREPARING",
      expiresAt: intent.intent.expiresAt ?? new Date(input.now.getTime() + 60_000),
    });
    return { kind: "reserved" as const, amount: intent.intent.amount, expiresAt: intent.intent.expiresAt };
  });

  if (reservation.kind === "existing") {
    return { requestId: reservation.existing.id, invoice: reservation.existing.destination, duplicate: true };
  }

  try {
    const invoice = await gateway.createLightningInvoice({ amountSats: reservation.amount, description: input.description });
    if (reservation.expiresAt && invoice.expiresAt > reservation.expiresAt) {
      throw new DomainError("Invoice expira depois da reserva da pool.", "BREEZ_INVOICE_EXPIRY_MISMATCH");
    }
    await db.transaction(async (tx) => {
      const updated = await tx.update(externalPaymentRequests).set({
        destination: invoice.invoice,
        externalReference: invoice.paymentHash,
        feesSat: invoice.feesSats,
        expiresAt: invoice.expiresAt,
        status: "PENDING",
        updatedAt: input.now,
      }).where(and(eq(externalPaymentRequests.id, input.requestId), eq(externalPaymentRequests.status, "PREPARING"))).returning({ id: externalPaymentRequests.id });
      if (updated.length !== 1) throw new DomainError("Estado da invoice mudou durante a criação.", "BREEZ_RESULT_UNKNOWN");
      await tx.update(contributionIntents).set({ status: "INVOICE_ISSUED", invoiceReference: invoice.paymentHash, updatedAt: input.now }).where(eq(contributionIntents.id, input.intentId));
    });
    return { requestId: input.requestId, invoice: invoice.invoice, duplicate: false };
  } catch (error) {
    await db.update(externalPaymentRequests).set({ status: "UNKNOWN", errorCode: error instanceof DomainError ? error.code : "BREEZ_CREATE_FAILED", updatedAt: input.now }).where(eq(externalPaymentRequests.id, input.requestId));
    await triggerMainnetCircuitBreaker(db, { id: randomUUID(), demoRunId: input.demoRunId, idempotencyKey: `breaker:invoice:${input.requestId}`, reason: "INVOICE_CREATION_UNKNOWN", details: error instanceof DomainError ? error.code : "BREEZ_CREATE_FAILED", now: input.now }).catch(() => undefined);
    throw error;
  }
}

export async function processMainnetPaymentEvent<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  event: BreezPaymentEvent,
) {
  const [request] = await db.select().from(externalPaymentRequests).where(eq(externalPaymentRequests.externalReference, event.externalReference));
  if (!request) throw new DomainError("Evento Breez sem invoice conhecida.", "BREEZ_PAYMENT_NOT_FOUND");
  const payloadHash = eventHash(event);
  const deduplicationKey = `${event.externalReference}:${payloadHash}`;
  await db.insert(externalPaymentEvents).values({
    id: randomUUID(),
    paymentRequestId: request.id,
    deduplicationKey,
    eventType: event.eventType,
    externalReference: event.externalReference,
    amountSat: event.amountSats,
    payloadHash,
    receivedAt: event.occurredAt,
  }).onConflictDoNothing({ target: externalPaymentEvents.deduplicationKey });

  if (event.state !== "SETTLED") {
    const status = event.state === "FAILED" ? "FAILED" : event.state === "EXPIRED" ? "EXPIRED" : event.state === "UNKNOWN" || event.state === "REFUNDABLE" ? "UNKNOWN" : "PENDING";
    await db.update(externalPaymentRequests).set({ status, errorCode: status === "UNKNOWN" ? event.state : null, updatedAt: event.occurredAt }).where(eq(externalPaymentRequests.id, request.id));
    if (event.state === "UNKNOWN" || event.state === "REFUNDABLE" || event.state === "EXPIRED") await triggerMainnetCircuitBreaker(db, { id: randomUUID(), demoRunId: request.sessionId, idempotencyKey: `breaker:payment:${request.id}:${event.state}`, reason: `PAYMENT_${event.state}`, details: event.externalReference, now: event.occurredAt }).catch(() => undefined);
    return { requestId: request.id, status, allocated: false };
  }
  if (!request.intentId || event.amountSats !== request.expectedAmount || event.occurredAt > request.expiresAt) {
    await db.update(externalPaymentRequests).set({ status: "UNKNOWN", errorCode: event.amountSats !== request.expectedAmount ? "AMOUNT_MISMATCH" : "LATE_PAYMENT", updatedAt: event.occurredAt }).where(eq(externalPaymentRequests.id, request.id));
    const reason = event.amountSats !== request.expectedAmount ? "AMOUNT_MISMATCH" : "LATE_PAYMENT";
    await triggerMainnetCircuitBreaker(db, { id: randomUUID(), demoRunId: request.sessionId, idempotencyKey: `breaker:payment:${request.id}:${reason}`, reason, details: event.externalReference, now: event.occurredAt }).catch(() => undefined);
    return { requestId: request.id, status: "UNKNOWN" as const, allocated: false };
  }
  const [intent] = await db.select().from(contributionIntents).where(eq(contributionIntents.id, request.intentId));
  if (!intent) throw new DomainError("Intenção da invoice não encontrada.", "CONTRIBUTION_INTENT_MISMATCH");
  const allocation = await allocateContribution(db, {
    contributionId: `mainnet:${request.id}`,
    intentId: intent.id,
    poolId: intent.poolId,
    externalPaymentReference: event.externalReference,
    amount: event.amountSats,
    settledAt: event.occurredAt,
  });
  const accounts = await ensureMainnetLedgerAccounts(db, intent.poolId);
  await recordLedgerTransaction(db, {
    id: `ledger:${request.id}`,
    idempotencyKey: `breez-mainnet:${event.externalReference}`,
    description: "Aporte Breez mainnet conciliado",
    correlationId: request.id,
    postings: [
      { accountId: accounts.walletAccountId, asset: "BTC", amount: event.amountSats },
      { accountId: accounts.poolAccountId, asset: "BTC", amount: -event.amountSats },
    ],
  });
  await db.transaction(async (tx) => {
    await tx.update(externalPaymentRequests).set({ status: "SETTLED", settledAt: event.occurredAt, errorCode: null, updatedAt: event.occurredAt }).where(eq(externalPaymentRequests.id, request.id));
    await tx.update(externalPaymentEvents).set({ processedAt: event.occurredAt }).where(eq(externalPaymentEvents.deduplicationKey, deduplicationKey));
  });
  return { requestId: request.id, status: "SETTLED" as const, allocated: true, duplicate: allocation.duplicate };
}

export async function prepareMainnetAssetSwap<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  gateway: BreezLiquidGateway,
  input: { swapId: string; poolId: string; idempotencyKey: string; direction: "L_BTC_TO_USDT" | "USDT_TO_L_BTC"; fromAssetId: string; toAssetId: string; receiverAmountUnits: bigint; maxSlippageBps: number },
) {
  const [pool] = await db.select({ environment: pools.environment }).from(pools).where(eq(pools.id, input.poolId));
  if (!pool || pool.environment !== "MAINNET") throw new DomainError("Swap exige pool mainnet.", "MAINNET_POOL_REQUIRED");
  const directionMatches = input.direction === "L_BTC_TO_USDT"
    ? input.fromAssetId === MAINNET_LBTC_ASSET_ID && input.toAssetId === MAINNET_USDT_ASSET_ID
    : input.fromAssetId === MAINNET_USDT_ASSET_ID && input.toAssetId === MAINNET_LBTC_ASSET_ID;
  if (!directionMatches) throw new DomainError("Direção do swap não corresponde aos asset IDs.", "BREEZ_SWAP_DIRECTION_MISMATCH");
  const [existing] = await db.select().from(externalSwapAttempts).where(eq(externalSwapAttempts.idempotencyKey, input.idempotencyKey));
  if (existing) throw new DomainError("Swap já preparado; retry automático bloqueado.", "BREEZ_RESULT_UNKNOWN");
  const prepared = await gateway.prepareAssetSwap(input);
  await db.insert(externalSwapAttempts).values({
    id: input.swapId,
    poolId: input.poolId,
    idempotencyKey: input.idempotencyKey,
    environment: "MAINNET",
    direction: input.direction,
    fromAssetId: prepared.fromAssetId,
    toAssetId: prepared.toAssetId,
    receiverAmountUnits: prepared.receiverAmountUnits,
    feesSat: prepared.feesSats,
    estimatedAssetFeesUnits: prepared.estimatedAssetFeesUnits,
    maxSlippageBps: input.maxSlippageBps,
    status: "PREPARED",
  });
  return prepared;
}

export async function executeMainnetAssetSwap<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, gateway: BreezLiquidGateway, swapId: string, prepared: PreparedAssetSwap,
) {
  const claimed = await db.update(externalSwapAttempts).set({ status: "EXECUTING" }).where(and(eq(externalSwapAttempts.id, swapId), eq(externalSwapAttempts.status, "PREPARED"))).returning({ id: externalSwapAttempts.id });
  if (claimed.length !== 1) throw new DomainError("Swap não está pronto; concilie antes de retry.", "BREEZ_RESULT_UNKNOWN");
  try {
    const executed = await gateway.executeAssetSwap(prepared);
    const status = executed.state === "SETTLED" ? "COMPLETE" : executed.state === "FAILED" ? "FAILED" : "EXECUTING";
    await db.update(externalSwapAttempts).set({ status, externalReference: executed.externalReference }).where(eq(externalSwapAttempts.id, swapId));
    return { swapId, status, externalReference: executed.externalReference };
  } catch (error) {
    await db.update(externalSwapAttempts).set({ status: "UNKNOWN", errorCode: error instanceof DomainError ? error.code : "BREEZ_SEND_FAILED" }).where(eq(externalSwapAttempts.id, swapId));
    throw error;
  }
}

export async function reconcileMainnetWallet<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, gateway: BreezLiquidGateway, input: { runId: string; idempotencyKey: string; usdtAssetId: string; now: Date },
) {
  const [existing] = await db.select().from(reconciliationRuns).where(eq(reconciliationRuns.idempotencyKey, input.idempotencyKey));
  if (existing) return { ...existing, duplicate: true };
  await gateway.sync();
  const balances = await gateway.getBalances();
  const rows = await db.select({ asset: ledgerEntries.asset, amount: ledgerEntries.amount }).from(ledgerEntries).innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId)).where(eq(ledgerAccounts.ownerType, "BREEZ_MAINNET_WALLET"));
  const ledgerBtcSats = rows.filter((row) => row.asset === "BTC").reduce((total, row) => total + row.amount, 0n);
  const ledgerUsdtUnits = rows.filter((row) => row.asset === "USDT").reduce((total, row) => total + row.amount, 0n);
  const externalUsdtUnits = balances.assetBalances[input.usdtAssetId] ?? 0n;
  const btcDifferenceSats = balances.btcSats - ledgerBtcSats;
  const usdtDifferenceUnits = externalUsdtUnits - ledgerUsdtUnits;
  const status = btcDifferenceSats === 0n && usdtDifferenceUnits === 0n ? "MATCHED" : "DIVERGED";
  const [created] = await db.insert(reconciliationRuns).values({
    id: input.runId, idempotencyKey: input.idempotencyKey, environment: "MAINNET", status,
    externalBtcSats: balances.btcSats, ledgerBtcSats, btcDifferenceSats,
    externalUsdtUnits, ledgerUsdtUnits, usdtDifferenceUnits,
    startedAt: input.now, completedAt: input.now,
  }).returning();
  return { ...created!, duplicate: false };
}
