import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createLedgerTransaction } from "./ledger";

describe("double-entry ledger", () => {
  it("accepts a balanced transaction", () => {
    const transaction = createLedgerTransaction({
      id: "tx-1",
      idempotencyKey: "payment:demo-1",
      description: "Aporte fictício",
      postings: [
        { accountId: "btc-custody", asset: "BTC", amount: 1_000n },
        { accountId: "pool-liability", asset: "BTC", amount: -1_000n },
      ],
    });

    expect(transaction.postings).toHaveLength(2);
  });

  it("rejects any unbalanced transaction", () => {
    expect(() =>
      createLedgerTransaction({
        id: "tx-2",
        idempotencyKey: "payment:demo-2",
        description: "Aporte inválido",
        postings: [
          { accountId: "btc-custody", asset: "BTC", amount: 1_000n },
          { accountId: "pool-liability", asset: "BTC", amount: -999n },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "UNBALANCED_LEDGER" }));
  });

  it("stays balanced for every generated positive BTC amount", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 21_000_000_0000_0000n }), (amount) => {
        const transaction = createLedgerTransaction({
          id: `tx-${amount}`,
          idempotencyKey: `property:${amount}`,
          description: "Teste de propriedade",
          postings: [
            { accountId: "asset", asset: "BTC", amount },
            { accountId: "liability", asset: "BTC", amount: -amount },
          ],
        });

        const total = transaction.postings.reduce(
          (sum, posting) => sum + posting.amount,
          0n,
        );
        expect(total).toBe(0n);
      }),
      { numRuns: 500 },
    );
  });

  it("balances each asset independently", () => {
    expect(() =>
      createLedgerTransaction({
        id: "tx-cross-asset",
        idempotencyKey: "cross-asset",
        description: "Ativos não se compensam",
        postings: [
          { accountId: "btc", asset: "BTC", amount: 100n },
          { accountId: "usd", asset: "USD_REFERENCE", amount: -100n },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "UNBALANCED_LEDGER" }));
  });
});
