import { DomainError } from "./errors";

export const CREDIT_LIMIT_RULE_VERSION = "credit-limit-v0.1";
export const USD_CENTS_PER_DOLLAR = 100n;
export const BASE_LIMIT_USD_CENTS = 100n * USD_CENTS_PER_DOLLAR;
export const IDENTITY_BONUS_USD_CENTS = 100n * USD_CENTS_PER_DOLLAR;
export const PROFESSIONAL_ACCOUNT_BONUS_USD_CENTS =
  50n * USD_CENTS_PER_DOLLAR;
export const UNSECURED_LIMIT_CAP_USD_CENTS = 1_000n * USD_CENTS_PER_DOLLAR;

export type CreditLimitSignals = Readonly<{
  identityVerified: boolean;
  professionalAccountsVerified: number;
  paidOperations: number;
  eligibleCollateralUsdCents: bigint;
}>;

export type CreditLimitBreakdown = Readonly<{
  ruleVersion: typeof CREDIT_LIMIT_RULE_VERSION;
  baseUsdCents: bigint;
  identityUsdCents: bigint;
  professionalAccountsUsdCents: bigint;
  paidHistoryUsdCents: bigint;
  unsecuredUsdCents: bigint;
  collateralUsdCents: bigint;
  collateralLimitUsdCents: bigint;
  totalUsdCents: bigint;
}>;

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(`${label} precisa ser um inteiro não negativo.`, "INVALID_COUNT");
  }
}

export function calculateCreditLimit(
  signals: CreditLimitSignals,
): CreditLimitBreakdown {
  assertCount(
    signals.professionalAccountsVerified,
    "Contas profissionais verificadas",
  );
  assertCount(signals.paidOperations, "Operações quitadas");

  if (signals.eligibleCollateralUsdCents < 0n) {
    throw new DomainError(
      "A garantia elegível não pode ser negativa.",
      "INVALID_COLLATERAL",
    );
  }

  const countedProfessionalAccounts = Math.min(
    signals.professionalAccountsVerified,
    2,
  );
  const professionalAccountsUsdCents =
    BigInt(countedProfessionalAccounts) * PROFESSIONAL_ACCOUNT_BONUS_USD_CENTS;
  const identityUsdCents = signals.identityVerified
    ? IDENTITY_BONUS_USD_CENTS
    : 0n;
  const paidHistoryUsdCents =
    (signals.paidOperations >= 1 ? 100n * USD_CENTS_PER_DOLLAR : 0n) +
    (signals.paidOperations >= 2 ? 200n * USD_CENTS_PER_DOLLAR : 0n) +
    (signals.paidOperations >= 3 ? 400n * USD_CENTS_PER_DOLLAR : 0n);
  const unsecuredBeforeCap =
    BASE_LIMIT_USD_CENTS +
    identityUsdCents +
    professionalAccountsUsdCents +
    paidHistoryUsdCents;
  const unsecuredUsdCents =
    unsecuredBeforeCap > UNSECURED_LIMIT_CAP_USD_CENTS
      ? UNSECURED_LIMIT_CAP_USD_CENTS
      : unsecuredBeforeCap;
  const collateralLimitUsdCents = signals.eligibleCollateralUsdCents * 2n;
  const totalUsdCents =
    collateralLimitUsdCents > unsecuredUsdCents
      ? collateralLimitUsdCents
      : unsecuredUsdCents;

  return Object.freeze({
    ruleVersion: CREDIT_LIMIT_RULE_VERSION,
    baseUsdCents: BASE_LIMIT_USD_CENTS,
    identityUsdCents,
    professionalAccountsUsdCents,
    paidHistoryUsdCents,
    unsecuredUsdCents,
    collateralUsdCents: signals.eligibleCollateralUsdCents,
    collateralLimitUsdCents,
    totalUsdCents,
  });
}

export function availableCreditLimit(
  totalUsdCents: bigint,
  usedUsdCents: bigint,
): bigint {
  if (totalUsdCents < 0n || usedUsdCents < 0n) {
    throw new DomainError(
      "Limite total e utilizado não podem ser negativos.",
      "INVALID_LIMIT",
    );
  }

  const available = totalUsdCents - usedUsdCents;
  return available > 0n ? available : 0n;
}
