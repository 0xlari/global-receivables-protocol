import { randomUUID } from "node:crypto";

import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import {
  auditEvents,
  contributionIntents,
  contributions,
  outboxEvents,
  partialPoolDecisions,
  poolAllocations,
  poolQuotes,
  poolSettlementSimulations,
  pools,
  receivables,
} from "@/db/schema";
import { DomainError } from "@/domain/errors";
import { positiveMoney } from "@/domain/money";
import {
  POOL_FINANCIAL_RULES_VERSION,
  simulatePool,
  type PoolMode,
  type RiskBand,
} from "@/domain/pool";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

export async function createSimulationQuote<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    id: string;
    btcPriceUsdCents: bigint;
    sourceReference: string;
    quotedAt: Date;
    expiresAt: Date;
    lightningFeeSats?: bigint;
    swapFeeUsdCents?: bigint;
  },
) {
  if (input.btcPriceUsdCents <= 0n || input.expiresAt <= input.quotedAt) {
    throw new DomainError("Cotação simulada inválida.", "INVALID_QUOTE");
  }
  const [quote] = await db
    .insert(poolQuotes)
    .values({
      id: input.id,
      btcPriceUsdCents: input.btcPriceUsdCents,
      source: "SIMULATION_FIXTURE",
      sourceReference: input.sourceReference,
      spreadBps: 0,
      lightningFeeSats: input.lightningFeeSats ?? 0n,
      swapFeeUsdCents: input.swapFeeUsdCents ?? 0n,
      quotedAt: input.quotedAt,
      expiresAt: input.expiresAt,
    })
    .onConflictDoNothing({ target: poolQuotes.sourceReference })
    .returning();
  if (quote) return { quoteId: quote.id, duplicate: false };
  const [existing] = await db.select().from(poolQuotes).where(eq(poolQuotes.sourceReference, input.sourceReference));
  if (!existing) throw new Error("Falha ao recuperar cotação simulada.");
  if (
    existing.btcPriceUsdCents !== input.btcPriceUsdCents ||
    existing.quotedAt.getTime() !== input.quotedAt.getTime() ||
    existing.expiresAt.getTime() !== input.expiresAt.getTime()
  ) {
    throw new DomainError("Referência de cotação reutilizada com outros valores.", "IDEMPOTENCY_CONFLICT");
  }
  return { quoteId: existing.id, duplicate: true };
}

export async function openPoolForApprovedReceivable<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    poolId: string;
    receivableId: string;
    quoteId: string;
    mode: PoolMode;
    risk: RiskBand;
    now: Date;
    closesAt: Date;
    treasuryBtcReservedSats?: bigint;
    correlationId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [receivable] = await tx.select().from(receivables).where(eq(receivables.id, input.receivableId)).for("update");
    const [quote] = await tx.select().from(poolQuotes).where(eq(poolQuotes.id, input.quoteId));
    if (!receivable || receivable.status !== "APPROVED" || receivable.clientAcceptedBtc !== true) {
      throw new DomainError("Somente recebível aprovado pode criar pool.", "RECEIVABLE_NOT_ELIGIBLE");
    }
    if (!quote || quote.environment !== "SIMULATION" || quote.expiresAt <= input.now) {
      throw new DomainError("Cotação expirada ou inválida.", "QUOTE_EXPIRED");
    }
    if (input.closesAt <= input.now || input.closesAt >= receivable.dueAt) {
      throw new DomainError("Prazo de captação inválido.", "INVALID_POOL_DEADLINE");
    }
    const daysToDue = Math.ceil((receivable.dueAt.getTime() - input.now.getTime()) / 86_400_000);
    const simulation = simulatePool({
      mode: input.mode,
      nominalUsdCents: receivable.nominalAmount,
      daysToDue,
      risk: input.risk,
      btcPriceUsdCents: quote.btcPriceUsdCents,
      externalCostsUsdCents: quote.swapFeeUsdCents,
    });
    const treasury = input.treasuryBtcReservedSats ?? 0n;
    if (input.mode === "USD_PAIRED" && treasury < simulation.fundingTargetSats) {
      throw new DomainError("Tesouraria BTC insuficiente para a pool pareada.", "TREASURY_RESERVE_INSUFFICIENT");
    }
    if (input.mode === "FULL_BTC" && treasury !== 0n) {
      throw new DomainError("Full BTC não usa reserva pareada.", "INVALID_TREASURY_RESERVE");
    }

    await tx.insert(pools).values({
      id: input.poolId,
      receivableId: receivable.id,
      quoteId: quote.id,
      mode: input.mode,
      riskBand: input.risk,
      rulesVersion: simulation.rulesVersion,
      settlementAsset: input.mode === "FULL_BTC" ? "BTC" : "USDT",
      nominalUsdCents: simulation.nominalUsdCents,
      advanceUsdCents: simulation.advanceUsdCents,
      discountBps: simulation.discountBps,
      targetAmount: simulation.fundingTargetSats,
      pairedObligationUsdtUnits: simulation.pairedObligationUsdtUnits,
      treasuryBtcReservedSats: treasury,
      externalCostsUsdCents: quote.swapFeeUsdCents,
      status: "DRAFT",
      closesAt: input.closesAt,
    });
    await tx.update(receivables).set({ status: "POOLED", updatedAt: input.now }).where(eq(receivables.id, receivable.id));
    await tx.update(pools).set({ status: "OPEN", updatedAt: input.now }).where(eq(pools.id, input.poolId));
    await tx.insert(auditEvents).values({ id: randomUUID(), action: "POOL_OPENED_SIMULATION", targetType: "POOL", targetId: input.poolId, correlationId: input.correlationId, after: { mode: input.mode, rulesVersion: simulation.rulesVersion, discountBps: simulation.discountBps } });
    return { poolId: input.poolId, simulation };
  });
}

export async function reserveContributionCapacity<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { intentId: string; poolId: string; contributorId: string; amountSats: bigint; expiresAt: Date; now: Date },
) {
  positiveMoney(input.amountSats, "BTC");
  if (input.expiresAt <= input.now) throw new DomainError("Expiração da intenção inválida.", "INVALID_INTENT_EXPIRY");
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(contributionIntents).where(eq(contributionIntents.id, input.intentId));
    if (existing) {
      if (existing.poolId !== input.poolId || existing.contributorId !== input.contributorId || existing.amount !== input.amountSats) {
        throw new DomainError("Intenção reutilizada com outros valores.", "IDEMPOTENCY_CONFLICT");
      }
      return { intentId: existing.id, duplicate: true };
    }
    const [reserved] = await tx.update(pools).set({ reservedAmount: sql`${pools.reservedAmount} + ${input.amountSats}`, updatedAt: input.now }).where(and(eq(pools.id, input.poolId), eq(pools.status, "OPEN"), lte(sql`${pools.fundedAmount} + ${pools.reservedAmount} + ${input.amountSats}`, pools.targetAmount))).returning({ reservedAmount: pools.reservedAmount });
    if (!reserved) throw new DomainError("Pool sem capacidade disponível.", "POOL_CAPACITY_UNAVAILABLE");
    await tx.insert(contributionIntents).values({ id: input.intentId, poolId: input.poolId, contributorId: input.contributorId, amount: input.amountSats, asset: "BTC", status: "CREATED", capacityReserved: true, expiresAt: input.expiresAt });
    return { intentId: input.intentId, duplicate: false, reservedAmount: reserved.reservedAmount };
  });
}

export async function expireContributionIntent<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { intentId: string; now: Date },
) {
  return db.transaction(async (tx) => {
    const [intent] = await tx.select().from(contributionIntents).where(eq(contributionIntents.id, input.intentId)).for("update");
    if (!intent || !intent.expiresAt || intent.expiresAt > input.now) throw new DomainError("Intenção não pode expirar.", "INTENT_NOT_EXPIRABLE");
    if (["EXPIRED", "FAILED", "ALLOCATED", "DISTRIBUTED", "REFUND_PENDING", "REFUNDED"].includes(intent.status)) return { intentId: intent.id, duplicate: true };
    if (intent.capacityReserved) {
      const released = await tx.update(pools).set({ reservedAmount: sql`${pools.reservedAmount} - ${intent.amount}`, updatedAt: input.now }).where(and(eq(pools.id, intent.poolId), sql`${pools.reservedAmount} >= ${intent.amount}`)).returning({ id: pools.id });
      if (released.length !== 1) throw new DomainError("Reserva da intenção está inconsistente.", "POOL_RESERVATION_MISMATCH");
    }
    if (intent.status === "CREATED") await tx.update(contributionIntents).set({ status: "INVOICE_ISSUED" }).where(eq(contributionIntents.id, intent.id));
    await tx.update(contributionIntents).set({ status: "EXPIRED", capacityReserved: false, updatedAt: input.now }).where(eq(contributionIntents.id, intent.id));
    return { intentId: intent.id, duplicate: false };
  });
}

export type AllocateContributionInput = Readonly<{
  contributionId: string;
  intentId: string;
  poolId: string;
  externalPaymentReference: string;
  amount: bigint;
  settledAt: Date;
}>;

export type AllocateContributionResult = Readonly<{
  contributionId: string;
  duplicate: boolean;
  poolFundedAmount?: bigint;
}>;

export async function allocateContribution<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  input: AllocateContributionInput,
): Promise<AllocateContributionResult> {
  positiveMoney(input.amount, "BTC");

  return db.transaction(async (tx) => {
    const [intent] = await tx
      .select()
      .from(contributionIntents)
      .where(eq(contributionIntents.id, input.intentId))
      .for("update");
    if (!intent || intent.poolId !== input.poolId || intent.amount !== input.amount) {
      throw new DomainError("Intenção não corresponde ao aporte.", "CONTRIBUTION_INTENT_MISMATCH");
    }
    if (intent.expiresAt && intent.expiresAt <= input.settledAt) {
      throw new DomainError("Intenção de aporte expirada.", "CONTRIBUTION_INTENT_EXPIRED");
    }
    const [insertedContribution] = await tx
      .insert(contributions)
      .values({
        id: input.contributionId,
        intentId: input.intentId,
        externalPaymentReference: input.externalPaymentReference,
        amount: input.amount,
        asset: "BTC",
        status: "SETTLED",
        settledAt: input.settledAt,
      })
      .onConflictDoNothing({ target: contributions.externalPaymentReference })
      .returning({ id: contributions.id });

    if (!insertedContribution) {
      const [existing] = await tx
        .select({ id: contributions.id, intentId: contributions.intentId, amount: contributions.amount })
        .from(contributions)
        .where(
          eq(
            contributions.externalPaymentReference,
            input.externalPaymentReference,
          ),
        )
        .limit(1);

      if (!existing) {
        throw new Error("Falha ao recuperar aporte idempotente existente.");
      }
      if (existing.intentId !== input.intentId || existing.amount !== input.amount) {
        throw new DomainError("Referência de pagamento reutilizada em outro aporte.", "IDEMPOTENCY_CONFLICT");
      }

      return { contributionId: existing.id, duplicate: true };
    }

    const [fundedPool] = await tx
      .update(pools)
      .set({
        fundedAmount: sql`${pools.fundedAmount} + ${input.amount}`,
        reservedAmount: intent.capacityReserved
          ? sql`${pools.reservedAmount} - ${input.amount}`
          : pools.reservedAmount,
        updatedAt: input.settledAt,
      })
      .where(
        and(
          eq(pools.id, input.poolId),
          eq(pools.status, "OPEN"),
          lte(
            sql`${pools.fundedAmount} + ${pools.reservedAmount} + ${intent.capacityReserved ? 0n : input.amount}`,
            pools.targetAmount,
          ),
          intent.capacityReserved
            ? sql`${pools.reservedAmount} >= ${input.amount}`
            : sql`true`,
        ),
      )
      .returning({
        fundedAmount: pools.fundedAmount,
        targetAmount: pools.targetAmount,
      });

    if (!fundedPool) {
      throw new DomainError(
        "Pool fechada, inexistente ou sem espaço para o aporte.",
        "POOL_ALLOCATION_REJECTED",
      );
    }

    await tx.insert(poolAllocations).values({
      poolId: input.poolId,
      contributionId: input.contributionId,
      amount: input.amount,
    });

    await tx
      .update(contributions)
      .set({ status: "ALLOCATED" })
      .where(eq(contributions.id, input.contributionId));

    if (intent.status === "CREATED") {
      await tx.update(contributionIntents).set({ status: "INVOICE_ISSUED" }).where(eq(contributionIntents.id, intent.id));
      await tx.update(contributionIntents).set({ status: "PENDING" }).where(eq(contributionIntents.id, intent.id));
    } else if (intent.status === "INVOICE_ISSUED") {
      await tx.update(contributionIntents).set({ status: "PENDING" }).where(eq(contributionIntents.id, intent.id));
    }
    await tx.update(contributionIntents).set({ status: "SETTLED", capacityReserved: false }).where(eq(contributionIntents.id, intent.id));
    await tx.update(contributionIntents).set({ status: "ALLOCATED", updatedAt: input.settledAt }).where(eq(contributionIntents.id, intent.id));

    if (fundedPool.fundedAmount === fundedPool.targetAmount) {
      await tx
        .update(pools)
        .set({ status: "FULL", updatedAt: input.settledAt })
        .where(
          and(eq(pools.id, input.poolId), eq(pools.fundedAmount, fundedPool.targetAmount)),
        );
    }

    return {
      contributionId: input.contributionId,
      duplicate: false,
      poolFundedAmount: fundedPool.fundedAmount,
    };
  });
}

export async function closeExpiredPool<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { poolId: string; now: Date; correlationId: string },
) {
  return db.transaction(async (tx) => {
    const [pool] = await tx.select().from(pools).where(eq(pools.id, input.poolId)).for("update");
    if (!pool || pool.status !== "OPEN" || pool.closesAt > input.now) throw new DomainError("Pool não pode ser encerrada.", "POOL_NOT_EXPIRABLE");
    if (pool.reservedAmount !== 0n) throw new DomainError("Existem intenções ainda reservadas.", "POOL_HAS_RESERVATIONS");
    const status = pool.fundedAmount === 0n ? "CANCELLED" : "PARTIAL_EXPIRED";
    await tx.update(pools).set({ status, updatedAt: input.now }).where(eq(pools.id, pool.id));
    await tx.insert(auditEvents).values({ id: randomUUID(), action: "POOL_FUNDING_EXPIRED", targetType: "POOL", targetId: pool.id, correlationId: input.correlationId, after: { status, fundedAmount: pool.fundedAmount.toString() } });
    return { poolId: pool.id, status, fundedAmount: pool.fundedAmount };
  });
}

export async function decidePartialPool<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { poolId: string; requesterId: string; decision: "ACCEPT_PARTIAL" | "REFUND"; reason: string; idempotencyKey: string; now: Date; correlationId: string },
) {
  if (input.reason.trim().length < 5) throw new DomainError("Motivo da decisão é obrigatório.", "PARTIAL_DECISION_REASON_REQUIRED");
  return db.transaction(async (tx) => {
    const [pool] = await tx.select().from(pools).where(eq(pools.id, input.poolId)).for("update");
    if (!pool) throw new DomainError("Pool não encontrada.", "POOL_NOT_FOUND");
    const [receivable] = await tx.select({ requesterId: receivables.requesterId }).from(receivables).where(eq(receivables.id, pool.receivableId));
    if (!receivable || receivable.requesterId !== input.requesterId) throw new DomainError("Apenas a solicitante pode decidir.", "PARTIAL_DECISION_FORBIDDEN");
    const [existing] = await tx.select().from(partialPoolDecisions).where(eq(partialPoolDecisions.idempotencyKey, input.idempotencyKey));
    if (existing) {
      if (existing.poolId !== input.poolId || existing.decision !== input.decision || existing.actorId !== input.requesterId) {
        throw new DomainError("Chave idempotente reutilizada em outra decisão.", "IDEMPOTENCY_CONFLICT");
      }
      return { poolId: existing.poolId, decision: existing.decision, duplicate: true };
    }
    if (pool.status !== "PARTIAL_EXPIRED") throw new DomainError("Pool não aguarda decisão parcial.", "INVALID_POOL_STATE");
    await tx.insert(partialPoolDecisions).values({ id: randomUUID(), poolId: pool.id, decision: input.decision, actorId: input.requesterId, fundedAmount: pool.fundedAmount, reason: input.reason.trim(), idempotencyKey: input.idempotencyKey });
    const status = input.decision === "ACCEPT_PARTIAL" ? "ACCEPTED_PARTIAL" : "REFUNDING";
    await tx.update(pools).set({ status, updatedAt: input.now }).where(eq(pools.id, pool.id));
    if (input.decision === "REFUND") {
      const allocated = await tx
        .select({ contributionId: poolAllocations.contributionId })
        .from(poolAllocations)
        .where(eq(poolAllocations.poolId, pool.id));
      if (allocated.length > 0) {
        await tx
          .update(contributions)
          .set({ status: "REFUND_PENDING" })
          .where(
            and(
              eq(contributions.status, "ALLOCATED"),
              inArray(
                contributions.id,
                allocated.map((item) => item.contributionId),
              ),
            ),
          );
      }
    }
    await tx.insert(auditEvents).values({ id: randomUUID(), actorId: input.requesterId, action: "PARTIAL_POOL_DECIDED", targetType: "POOL", targetId: pool.id, correlationId: input.correlationId, after: { decision: input.decision, fundedAmount: pool.fundedAmount.toString() } });
    await tx.insert(outboxEvents).values({ id: randomUUID(), topic: input.decision === "REFUND" ? "pool.refunds.requested" : "pool.partial.accepted", aggregateType: "POOL", aggregateId: pool.id, payload: { simulationOnly: true } });
    return { poolId: pool.id, decision: input.decision, duplicate: false };
  });
}

export async function recordSettlementSimulation<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { poolId: string; idempotencyKey: string; paymentUsdCents: bigint; requesterCostsUsdCents: bigint; applicableLossesUsdCents: bigint },
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(poolSettlementSimulations).where(eq(poolSettlementSimulations.idempotencyKey, input.idempotencyKey));
    if (existing) {
      if (existing.poolId !== input.poolId || existing.paymentUsdCents !== input.paymentUsdCents || existing.externalCostsUsdCents !== input.requesterCostsUsdCents || existing.applicableLossesUsdCents !== input.applicableLossesUsdCents) {
        throw new DomainError("Chave idempotente reutilizada em outra simulação.", "IDEMPOTENCY_CONFLICT");
      }
      return { simulationId: existing.id, duplicate: true, netResultUsdCents: existing.netResultUsdCents };
    }
    const [pool] = await tx.select().from(pools).where(eq(pools.id, input.poolId));
    if (!pool || !["FULL", "ACCEPTED_PARTIAL", "FUNDED", "SETTLING"].includes(pool.status)) throw new DomainError("Pool não pode simular liquidação.", "INVALID_POOL_STATE");
    if (input.paymentUsdCents < 0n || input.requesterCostsUsdCents < 0n || input.applicableLossesUsdCents < 0n) throw new DomainError("Valores da liquidação são inválidos.", "INVALID_AMOUNT");
    const principalUsdCents = pool.status === "ACCEPTED_PARTIAL"
      ? (pool.advanceUsdCents * pool.fundedAmount) / pool.targetAmount
      : pool.advanceUsdCents;
    const maximumPaymentUsdCents = pool.status === "ACCEPTED_PARTIAL"
      ? (pool.nominalUsdCents * pool.fundedAmount) / pool.targetAmount
      : pool.nominalUsdCents;
    if (input.paymentUsdCents > maximumPaymentUsdCents) throw new DomainError("Pagamento excede a parcela econômica da pool.", "SETTLEMENT_PAYMENT_EXCEEDED");
    const rawResult = input.paymentUsdCents - principalUsdCents - input.applicableLossesUsdCents;
    const netResultUsdCents = rawResult > 0n ? rawResult : 0n;
    const platformResultUsdCents = (netResultUsdCents * 3_000n) / 10_000n;
    const contributorsResultUsdCents = netResultUsdCents - platformResultUsdCents;
    const id = randomUUID();
    await tx.insert(poolSettlementSimulations).values({ id, poolId: pool.id, idempotencyKey: input.idempotencyKey, paymentUsdCents: input.paymentUsdCents, principalUsdCents, externalCostsUsdCents: input.requesterCostsUsdCents, applicableLossesUsdCents: input.applicableLossesUsdCents, netResultUsdCents, platformResultUsdCents, contributorsResultUsdCents, rulesVersion: POOL_FINANCIAL_RULES_VERSION });
    return { simulationId: id, duplicate: false, principalUsdCents, netResultUsdCents, platformResultUsdCents, contributorsResultUsdCents };
  });
}
