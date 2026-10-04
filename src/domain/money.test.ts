import { describe, expect, it } from "vitest";

import { addMoney, money, positiveMoney, subtractMoney } from "./money";

describe("money", () => {
  it("keeps amounts as integers and preserves the asset", () => {
    expect(addMoney(money(1_000n, "BTC"), money(250n, "BTC"))).toEqual({
      amount: 1_250n,
      asset: "BTC",
    });
    expect(subtractMoney(money(1_000n, "USDT"), money(1n, "USDT"))).toEqual({
      amount: 999n,
      asset: "USDT",
    });
  });

  it("rejects non-positive values where positive money is required", () => {
    expect(() => positiveMoney(0n, "BTC")).toThrowError(
      expect.objectContaining({ code: "INVALID_AMOUNT" }),
    );
  });

  it("never combines different assets", () => {
    expect(() =>
      addMoney(money(1n, "BTC"), money(1n, "USD_REFERENCE")),
    ).toThrowError(expect.objectContaining({ code: "ASSET_MISMATCH" }));
  });
});
