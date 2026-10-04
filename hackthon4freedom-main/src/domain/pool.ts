import { DomainError } from "./errors";

export const POOL_FINANCIAL_RULES_VERSION = "pool-financial-v0.2";

export function calculateExpectedContributorReturnBps(discountBps: number) {
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 500) {
    throw new DomainError("Desconto inválido para estimar retorno.", "INVALID_DISCOUNT");
  }
  return Math.floor((discountBps * 7_000) / (10_000 - discountBps));
}
export const MAX_DISCOUNT_BPS = 500;

export type RiskBand = "LOW" | "MEDIUM" | "HIGH";
export type PoolMode = "FULL_BTC" | "USD_PAIRED";

function divideRoundUp(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) {
    throw new DomainError("Divisor precisa ser positivo.", "INVALID_AMOUNT");
  }
  return (numerator + denominator - 1n) / denominator;
}

export function calculateDiscountBps(daysToDue: number, risk: RiskBand) {
  if (!Number.isInteger(daysToDue) || daysToDue < 1 || daysToDue > 90) {
    throw new DomainError(
      "O vencimento deve estar entre 1 e 90 dias.",
      "INVALID_DUE_DATE",
    );
  }
  const termBps =
    daysToDue <= 15 ? 200 : daysToDue <= 30 ? 300 : daysToDue <= 60 ? 400 : 500;
  const riskBps = risk === "LOW" ? 0 : risk === "MEDIUM" ? 100 : 200;
  return Math.min(termBps + riskBps, MAX_DISCOUNT_BPS);
}

export function calculateAdvanceUsdCents(
  nominalUsdCents: bigint,
  discountBps: number,
) {
  if (nominalUsdCents <= 0n || !Number.isInteger(discountBps) || discountBps < 0 || discountBps > MAX_DISCOUNT_BPS) {
    throw new DomainError("Valor ou desconto inválido.", "INVALID_AMOUNT");
  }
  return (nominalUsdCents * BigInt(10_000 - discountBps)) / 10_000n;
}

export function usdCentsToSatsRoundUp(
  usdCents: bigint,
  btcPriceUsdCents: bigint,
) {
  if (usdCents < 0n || btcPriceUsdCents <= 0n) {
    throw new DomainError("Cotação inválida.", "INVALID_QUOTE");
  }
  return divideRoundUp(usdCents * 100_000_000n, btcPriceUsdCents);
}

export function usdCentsToUsdtUnits(usdCents: bigint) {
  if (usdCents < 0n) {
    throw new DomainError("Valor USDt inválido.", "INVALID_AMOUNT");
  }
  return usdCents * 1_000_000n;
}

export type PoolSimulation = Readonly<{
  rulesVersion: string;
  mode: PoolMode;
  discountBps: number;
  nominalUsdCents: bigint;
  advanceUsdCents: bigint;
  fundingTargetSats: bigint;
  pairedObligationUsdtUnits: bigint;
  grossDiscountUsdCents: bigint;
  requesterCostsUsdCents: bigint;
  requesterNetDisbursementUsdCents: bigint;
  netResultUsdCents: bigint;
  platformResultUsdCents: bigint;
  contributorsResultUsdCents: bigint;
}>;

export function simulatePool(input: {
  mode: PoolMode;
  nominalUsdCents: bigint;
  daysToDue: number;
  risk: RiskBand;
  btcPriceUsdCents: bigint;
  externalCostsUsdCents: bigint;
  applicableLossesUsdCents?: bigint;
}): PoolSimulation {
  if (input.externalCostsUsdCents < 0n || (input.applicableLossesUsdCents ?? 0n) < 0n) {
    throw new DomainError("Custos e perdas não podem ser negativos.", "INVALID_AMOUNT");
  }
  const discountBps = calculateDiscountBps(input.daysToDue, input.risk);
  const advanceUsdCents = calculateAdvanceUsdCents(input.nominalUsdCents, discountBps);
  const grossDiscountUsdCents = input.nominalUsdCents - advanceUsdCents;
  const requesterNetDisbursementUsdCents = advanceUsdCents - input.externalCostsUsdCents;
  if (requesterNetDisbursementUsdCents < 0n) {
    throw new DomainError(
      "Taxas e spread não podem superar a antecipação.",
      "COSTS_EXCEED_ADVANCE",
    );
  }
  const netBeforeFloor = grossDiscountUsdCents - (input.applicableLossesUsdCents ?? 0n);
  const netResultUsdCents = netBeforeFloor > 0n ? netBeforeFloor : 0n;
  const platformResultUsdCents = (netResultUsdCents * 3_000n) / 10_000n;
  const contributorsResultUsdCents = netResultUsdCents - platformResultUsdCents;

  return Object.freeze({
    rulesVersion: POOL_FINANCIAL_RULES_VERSION,
    mode: input.mode,
    discountBps,
    nominalUsdCents: input.nominalUsdCents,
    advanceUsdCents,
    fundingTargetSats: usdCentsToSatsRoundUp(advanceUsdCents, input.btcPriceUsdCents),
    pairedObligationUsdtUnits:
      input.mode === "USD_PAIRED" ? usdCentsToUsdtUnits(advanceUsdCents) : 0n,
    grossDiscountUsdCents,
    requesterCostsUsdCents: input.externalCostsUsdCents,
    requesterNetDisbursementUsdCents,
    netResultUsdCents,
    platformResultUsdCents,
    contributorsResultUsdCents,
  });
}

export type DistributionShare = Readonly<{
  participantId: string;
  principalUsdCents: bigint;
  resultUsdCents: bigint;
  totalUsdCents: bigint;
}>;

export function distributeContributorResult(
  contributions: readonly Readonly<{ participantId: string; amount: bigint }>[],
  principalUsdCents: bigint,
  contributorsResultUsdCents: bigint,
): readonly DistributionShare[] {
  if (contributions.length === 0 || principalUsdCents < 0n || contributorsResultUsdCents < 0n) {
    throw new DomainError("Distribuição inválida.", "INVALID_DISTRIBUTION");
  }
  const totalWeight = contributions.reduce((total, item) => total + item.amount, 0n);
  if (
    totalWeight <= 0n ||
    contributions.some((item) => item.amount <= 0n) ||
    new Set(contributions.map((item) => item.participantId)).size !== contributions.length
  ) {
    throw new DomainError("Aportes precisam ser positivos.", "INVALID_DISTRIBUTION");
  }

  const allocate = (total: bigint) => {
    const provisional = contributions.map((item) => ({
      participantId: item.participantId,
      value: (total * item.amount) / totalWeight,
      remainder: (total * item.amount) % totalWeight,
    }));
    let residual = total - provisional.reduce((sum, item) => sum + item.value, 0n);
    const order = [...provisional].sort((a, b) =>
      a.remainder === b.remainder
        ? a.participantId.localeCompare(b.participantId)
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
    const extras = new Set(order.slice(0, Number(residual)).map((item) => item.participantId));
    residual = 0n;
    return new Map(provisional.map((item) => [item.participantId, item.value + (extras.has(item.participantId) ? 1n : 0n)]));
  };

  const principals = allocate(principalUsdCents);
  const results = allocate(contributorsResultUsdCents);
  return contributions.map((item) => {
    const principal = principals.get(item.participantId) ?? 0n;
    const result = results.get(item.participantId) ?? 0n;
    return Object.freeze({ participantId: item.participantId, principalUsdCents: principal, resultUsdCents: result, totalUsdCents: principal + result });
  });
}

export type PoolFunding = Readonly<{
  targetAmount: bigint;
  fundedAmount: bigint;
  reservedAmount?: bigint;
}>;

export function allocateToPool(
  pool: PoolFunding,
  contributionAmount: bigint,
): PoolFunding {
  if (pool.targetAmount <= 0n || contributionAmount <= 0n) {
    throw new DomainError(
      "Meta e aporte precisam ser positivos.",
      "INVALID_AMOUNT",
    );
  }

  const fundedAmount = pool.fundedAmount + contributionAmount;
  const reservedAmount = pool.reservedAmount ?? 0n;

  if (fundedAmount + reservedAmount > pool.targetAmount) {
    throw new DomainError(
      "O aporte ultrapassa a meta da pool.",
      "POOL_OVERFUNDED",
    );
  }

  return Object.freeze({ ...pool, fundedAmount });
}
