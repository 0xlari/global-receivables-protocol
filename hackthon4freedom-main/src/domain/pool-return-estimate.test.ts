import { describe, expect, it } from "vitest";

import { estimatePoolReturnSats } from "./pool-return-estimate";

describe("estimatePoolReturnSats", () => {
  it("applies the 70% contributor share and shows BTC price scenarios", () => {
    const result = estimatePoolReturnSats(100_000, 500);
    expect(result.centralSats).toBe(103_684);
    expect(result.estimatedProfitSats).toBe(3_684);
    expect(result.btcUpTenPercentSats).toBeLessThan(result.centralSats);
    expect(result.btcDownTenPercentSats).toBeGreaterThan(result.centralSats);
  });

  it("rejects invalid or policy-breaking values", () => {
    expect(() => estimatePoolReturnSats(0, 300)).toThrow();
    expect(() => estimatePoolReturnSats(100_000, 501)).toThrow();
  });
});
