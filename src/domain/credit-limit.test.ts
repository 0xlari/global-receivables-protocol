import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  availableCreditLimit,
  BASE_LIMIT_USD_CENTS,
  calculateCreditLimit,
  UNSECURED_LIMIT_CAP_USD_CENTS,
} from "./credit-limit";

describe("credit limit rule v0.1", () => {
  it("starts every profile at US$ 100", () => {
    const result = calculateCreditLimit({
      identityVerified: false,
      professionalAccountsVerified: 0,
      paidOperations: 0,
      eligibleCollateralUsdCents: 0n,
    });

    expect(result.totalUsdCents).toBe(BASE_LIMIT_USD_CENTS);
  });

  it("applies verified identity, professional accounts and paid history", () => {
    const result = calculateCreditLimit({
      identityVerified: true,
      professionalAccountsVerified: 2,
      paidOperations: 2,
      eligibleCollateralUsdCents: 0n,
    });

    expect(result).toMatchObject({
      baseUsdCents: 10_000n,
      identityUsdCents: 10_000n,
      professionalAccountsUsdCents: 10_000n,
      paidHistoryUsdCents: 30_000n,
      unsecuredUsdCents: 60_000n,
      totalUsdCents: 60_000n,
    });
  });

  it("caps the unsecured component at US$ 1,000", () => {
    const result = calculateCreditLimit({
      identityVerified: true,
      professionalAccountsVerified: 20,
      paidOperations: 50,
      eligibleCollateralUsdCents: 0n,
    });

    expect(result.unsecuredUsdCents).toBe(UNSECURED_LIMIT_CAP_USD_CENTS);
  });

  it("turns US$ 500 of eligible collateral into a US$ 1,000 total limit", () => {
    const result = calculateCreditLimit({
      identityVerified: false,
      professionalAccountsVerified: 0,
      paidOperations: 0,
      eligibleCollateralUsdCents: 50_000n,
    });

    expect(result.collateralLimitUsdCents).toBe(100_000n);
    expect(result.totalUsdCents).toBe(100_000n);
  });

  it("uses the greater component instead of adding collateral and history", () => {
    const result = calculateCreditLimit({
      identityVerified: true,
      professionalAccountsVerified: 2,
      paidOperations: 3,
      eligibleCollateralUsdCents: 50_000n,
    });

    expect(result.unsecuredUsdCents).toBe(100_000n);
    expect(result.collateralLimitUsdCents).toBe(100_000n);
    expect(result.totalUsdCents).toBe(100_000n);
  });

  it("never decreases when a valid signal increases", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10 }),
        fc.nat({ max: 10 }),
        fc.bigInt({ min: 0n, max: 1_000_000n }),
        (accounts, operations, collateral) => {
          const current = calculateCreditLimit({
            identityVerified: false,
            professionalAccountsVerified: accounts,
            paidOperations: operations,
            eligibleCollateralUsdCents: collateral,
          });
          const improved = calculateCreditLimit({
            identityVerified: true,
            professionalAccountsVerified: accounts + 1,
            paidOperations: operations + 1,
            eligibleCollateralUsdCents: collateral + 1n,
          });

          expect(improved.totalUsdCents).toBeGreaterThanOrEqual(
            current.totalUsdCents,
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it("blocks new usage when an expired signal leaves the profile overcommitted", () => {
    expect(availableCreditLimit(20_000n, 30_000n)).toBe(0n);
  });
});
