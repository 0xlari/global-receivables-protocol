import { randomUUID } from "node:crypto";

import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import {
  collaterals,
  consents,
  creditLimitEvents,
  creditLimits,
  identityEvidences,
  reputationFacts,
} from "@/db/schema";
import {
  availableCreditLimit,
  BASE_LIMIT_USD_CENTS,
  calculateCreditLimit,
  CREDIT_LIMIT_RULE_VERSION,
  type CreditLimitBreakdown,
} from "@/domain/credit-limit";
import { DomainError } from "@/domain/errors";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

export type CreditLimitResult = Readonly<{
  userId: string;
  totalUsdCents: bigint;
  usedUsdCents: bigint;
  availableUsdCents: bigint;
  version: number;
  duplicate: boolean;
}>;

export type LimitOperation = Readonly<{
  userId: string;
  idempotencyKey: string;
  correlationId: string;
  reason: string;
}>;

function serializeBreakdown(breakdown: CreditLimitBreakdown) {
  return {
    ruleVersion: breakdown.ruleVersion,
    baseUsdCents: breakdown.baseUsdCents.toString(),
    identityUsdCents: breakdown.identityUsdCents.toString(),
    professionalAccountsUsdCents:
      breakdown.professionalAccountsUsdCents.toString(),
    paidHistoryUsdCents: breakdown.paidHistoryUsdCents.toString(),
    unsecuredUsdCents: breakdown.unsecuredUsdCents.toString(),
    collateralUsdCents: breakdown.collateralUsdCents.toString(),
    collateralLimitUsdCents: breakdown.collateralLimitUsdCents.toString(),
    totalUsdCents: breakdown.totalUsdCents.toString(),
  };
}

const baseBreakdown = serializeBreakdown(
  calculateCreditLimit({
    identityVerified: false,
    professionalAccountsVerified: 0,
    paidOperations: 0,
    eligibleCollateralUsdCents: 0n,
  }),
);

function resultFromRow(
  row: typeof creditLimits.$inferSelect,
  duplicate: boolean,
): CreditLimitResult {
  return {
    userId: row.userId,
    totalUsdCents: row.totalAmount,
    usedUsdCents: row.usedAmount,
    availableUsdCents: availableCreditLimit(row.totalAmount, row.usedAmount),
    version: row.version,
    duplicate,
  };
}

export async function recalculateCreditLimit<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  operation: LimitOperation & { now: Date },
): Promise<CreditLimitResult> {
  return db.transaction(async (tx) => {
    await tx
      .insert(creditLimits)
      .values({
        userId: operation.userId,
        totalAmount: BASE_LIMIT_USD_CENTS,
        usedAmount: 0n,
        ruleVersion: CREDIT_LIMIT_RULE_VERSION,
        breakdown: baseBreakdown,
      })
      .onConflictDoNothing({ target: creditLimits.userId });

    const [current] = await tx
      .select()
      .from(creditLimits)
      .where(eq(creditLimits.userId, operation.userId))
      .for("update");

    if (!current) {
      throw new Error("Limite não encontrado após inicialização.");
    }

    const [existingEvent] = await tx
      .select({ id: creditLimitEvents.id })
      .from(creditLimitEvents)
      .where(eq(creditLimitEvents.idempotencyKey, operation.idempotencyKey))
      .limit(1);

    if (existingEvent) {
      return resultFromRow(current, true);
    }

    const validAt = operation.now;
    const evidenceRows = await tx
      .select({
        type: identityEvidences.type,
        provider: identityEvidences.provider,
      })
      .from(identityEvidences)
      .where(
        and(
          eq(identityEvidences.userId, operation.userId),
          eq(identityEvidences.status, "VERIFIED"),
          or(
            isNull(identityEvidences.expiresAt),
            gt(identityEvidences.expiresAt, validAt),
          ),
        ),
      );
    const consentRows = await tx
      .select({ type: consents.type })
      .from(consents)
      .where(
        and(eq(consents.userId, operation.userId), isNull(consents.revokedAt)),
      );
    const activeConsentTypes = new Set(consentRows.map((consent) => consent.type));
    const identityVerified =
      activeConsentTypes.has("IDENTITY_PROCESSING") &&
      evidenceRows.some((evidence) => evidence.type === "IDENTITY");
    const professionalProviders = new Set(
      evidenceRows
        .filter(
          (evidence) =>
            evidence.type === "PROFESSIONAL_ACCOUNT" &&
            activeConsentTypes.has("PROFESSIONAL_ACCOUNT"),
        )
        .map((evidence) => evidence.provider),
    );

    const paidOperationRows = await tx
      .select({ id: reputationFacts.id })
      .from(reputationFacts)
      .where(
        and(
          eq(reputationFacts.subjectType, "USER"),
          eq(reputationFacts.subjectId, operation.userId),
          eq(reputationFacts.type, "RECEIVABLE_PAID"),
          eq(reputationFacts.status, "ACTIVE"),
          lte(reputationFacts.occurredAt, validAt),
          or(
            isNull(reputationFacts.expiresAt),
            gt(reputationFacts.expiresAt, validAt),
          ),
        ),
      );

    const collateralRows = await tx
      .select({ eligibleUsdCents: collaterals.eligibleUsdCents })
      .from(collaterals)
      .where(
        and(
          eq(collaterals.userId, operation.userId),
          eq(collaterals.status, "ACTIVE"),
          eq(collaterals.environment, "SIMULATION"),
          or(isNull(collaterals.expiresAt), gt(collaterals.expiresAt, validAt)),
        ),
      );
    const eligibleCollateralUsdCents = collateralRows.reduce(
      (total, collateral) => total + collateral.eligibleUsdCents,
      0n,
    );
    const breakdown = calculateCreditLimit({
      identityVerified,
      professionalAccountsVerified: professionalProviders.size,
      paidOperations: paidOperationRows.length,
      eligibleCollateralUsdCents,
    });
    const serializedBreakdown = serializeBreakdown(breakdown);

    const [updated] = await tx
      .update(creditLimits)
      .set({
        totalAmount: breakdown.totalUsdCents,
        ruleVersion: CREDIT_LIMIT_RULE_VERSION,
        breakdown: serializedBreakdown,
        version: current.version + 1,
        updatedAt: operation.now,
      })
      .where(eq(creditLimits.userId, operation.userId))
      .returning();

    if (!updated) {
      throw new Error("Falha ao atualizar o limite.");
    }

    await tx.insert(creditLimitEvents).values({
      id: randomUUID(),
      userId: operation.userId,
      idempotencyKey: operation.idempotencyKey,
      ruleVersion: CREDIT_LIMIT_RULE_VERSION,
      reason: operation.reason,
      previousTotalAmount: current.totalAmount,
      newTotalAmount: updated.totalAmount,
      previousUsedAmount: current.usedAmount,
      newUsedAmount: updated.usedAmount,
      breakdown: serializedBreakdown,
      correlationId: operation.correlationId,
    });

    return resultFromRow(updated, false);
  });
}

export async function reserveCreditLimit<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  operation: LimitOperation & { amountUsdCents: bigint; now: Date },
): Promise<CreditLimitResult> {
  if (operation.amountUsdCents <= 0n) {
    throw new DomainError(
      "A reserva de limite precisa ser positiva.",
      "INVALID_AMOUNT",
    );
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(creditLimits)
      .where(eq(creditLimits.userId, operation.userId))
      .for("update");

    if (!current) {
      throw new DomainError("Limite ainda não calculado.", "LIMIT_NOT_FOUND");
    }

    const [existingEvent] = await tx
      .select({ id: creditLimitEvents.id })
      .from(creditLimitEvents)
      .where(eq(creditLimitEvents.idempotencyKey, operation.idempotencyKey))
      .limit(1);

    if (existingEvent) {
      return resultFromRow(current, true);
    }

    const newUsedAmount = current.usedAmount + operation.amountUsdCents;
    if (newUsedAmount > current.totalAmount) {
      throw new DomainError(
        "O valor solicitado ultrapassa o limite disponível.",
        "CREDIT_LIMIT_EXCEEDED",
      );
    }

    const [updated] = await tx
      .update(creditLimits)
      .set({
        usedAmount: newUsedAmount,
        version: current.version + 1,
        updatedAt: operation.now,
      })
      .where(eq(creditLimits.userId, operation.userId))
      .returning();

    if (!updated) {
      throw new Error("Falha ao reservar o limite.");
    }

    await tx.insert(creditLimitEvents).values({
      id: randomUUID(),
      userId: operation.userId,
      idempotencyKey: operation.idempotencyKey,
      ruleVersion: current.ruleVersion,
      reason: operation.reason,
      previousTotalAmount: current.totalAmount,
      newTotalAmount: updated.totalAmount,
      previousUsedAmount: current.usedAmount,
      newUsedAmount: updated.usedAmount,
      breakdown: current.breakdown,
      correlationId: operation.correlationId,
    });

    return resultFromRow(updated, false);
  });
}

export async function releaseCreditLimit<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  operation: LimitOperation & { amountUsdCents: bigint; now: Date },
): Promise<CreditLimitResult> {
  if (operation.amountUsdCents <= 0n) {
    throw new DomainError(
      "A liberação de limite precisa ser positiva.",
      "INVALID_AMOUNT",
    );
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(creditLimits)
      .where(eq(creditLimits.userId, operation.userId))
      .for("update");

    if (!current) {
      throw new DomainError("Limite ainda não calculado.", "LIMIT_NOT_FOUND");
    }

    const [existingEvent] = await tx
      .select({ id: creditLimitEvents.id })
      .from(creditLimitEvents)
      .where(eq(creditLimitEvents.idempotencyKey, operation.idempotencyKey))
      .limit(1);

    if (existingEvent) {
      return resultFromRow(current, true);
    }

    if (operation.amountUsdCents > current.usedAmount) {
      throw new DomainError(
        "Não é possível liberar mais limite do que o utilizado.",
        "LIMIT_RELEASE_EXCEEDED",
      );
    }

    const [updated] = await tx
      .update(creditLimits)
      .set({
        usedAmount: current.usedAmount - operation.amountUsdCents,
        version: current.version + 1,
        updatedAt: operation.now,
      })
      .where(eq(creditLimits.userId, operation.userId))
      .returning();

    if (!updated) {
      throw new Error("Falha ao liberar o limite.");
    }

    await tx.insert(creditLimitEvents).values({
      id: randomUUID(),
      userId: operation.userId,
      idempotencyKey: operation.idempotencyKey,
      ruleVersion: current.ruleVersion,
      reason: operation.reason,
      previousTotalAmount: current.totalAmount,
      newTotalAmount: updated.totalAmount,
      previousUsedAmount: current.usedAmount,
      newUsedAmount: updated.usedAmount,
      breakdown: current.breakdown,
      correlationId: operation.correlationId,
    });

    return resultFromRow(updated, false);
  });
}
