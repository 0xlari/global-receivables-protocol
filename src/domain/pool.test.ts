import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  allocateToPool,
  calculateDiscountBps,
  calculateExpectedContributorReturnBps,
  distributeContributorResult,
  simulatePool,
} from "./pool";

describe("pool funding", () => {
  it("never lets funding exceed the target", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10_000_000n }),
        fc.bigInt({ min: 1n, max: 10_000_000n }),
        (target, requested) => {
          if (requested <= target) {
            expect(
              allocateToPool(
                { targetAmount: target, fundedAmount: 0n },
                requested,
              ).fundedAmount,
            ).toBeLessThanOrEqual(target);
          } else {
            expect(() =>
              allocateToPool(
                { targetAmount: target, fundedAmount: 0n },
                requested,
              ),
            ).toThrowError(expect.objectContaining({ code: "POOL_OVERFUNDED" }));
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("respeita faixas de prazo e teto absoluto de 5%", () => {
    expect(calculateDiscountBps(15, "LOW")).toBe(200);
    expect(calculateDiscountBps(30, "MEDIUM")).toBe(400);
    expect(calculateDiscountBps(90, "HIGH")).toBe(500);
  });

  it("deriva o retorno público da regra central 70/30 sem entrada manual", () => {
    expect(calculateExpectedContributorReturnBps(500)).toBe(368);
    expect(calculateExpectedContributorReturnBps(0)).toBe(0);
    expect(() => calculateExpectedContributorReturnBps(501)).toThrowError(expect.objectContaining({ code: "INVALID_DISCOUNT" }));
  });

  it("cobra taxas da solicitante sem reduzir a pool e preserva o split 30/70", () => {
    const simulation = simulatePool({ mode: "USD_PAIRED", nominalUsdCents: 200_000n, daysToDue: 30, risk: "LOW", btcPriceUsdCents: 6_000_000n, externalCostsUsdCents: 1_000n });
    expect(simulation.advanceUsdCents).toBe(194_000n);
    expect(simulation.requesterCostsUsdCents).toBe(1_000n);
    expect(simulation.requesterNetDisbursementUsdCents).toBe(193_000n);
    expect(simulation.netResultUsdCents).toBe(6_000n);
    expect(simulation.platformResultUsdCents).toBe(1_800n);
    expect(simulation.contributorsResultUsdCents).toBe(4_200n);
    expect(simulation.pairedObligationUsdtUnits).toBe(194_000_000_000n);
  });

  it("distribui principal e resultado proporcionalmente com resíduo determinístico", () => {
    const shares = distributeContributorResult(
      [
        { participantId: "ana", amount: 2n },
        { participantId: "bia", amount: 1n },
      ],
      100n,
      7n,
    );
    expect(shares).toEqual([
      { participantId: "ana", principalUsdCents: 67n, resultUsdCents: 5n, totalUsdCents: 72n },
      { participantId: "bia", principalUsdCents: 33n, resultUsdCents: 2n, totalUsdCents: 35n },
    ]);
  });

  it("preserva soma em distribuições arbitrárias", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000n }),
        fc.bigInt({ min: 0n, max: 100_000n }),
        fc.bigInt({ min: 1n, max: 1_000n }),
        fc.bigInt({ min: 1n, max: 1_000n }),
        (principal, result, first, second) => {
          const shares = distributeContributorResult(
            [
              { participantId: "a", amount: first },
              { participantId: "b", amount: second },
            ],
            principal,
            result,
          );
          expect(shares.reduce((sum, share) => sum + share.principalUsdCents, 0n)).toBe(principal);
          expect(shares.reduce((sum, share) => sum + share.resultUsdCents, 0n)).toBe(result);
        },
      ),
      { numRuns: 300 },
    );
  });
});
