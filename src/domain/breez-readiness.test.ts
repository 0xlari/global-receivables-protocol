// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateBreezReadiness, type BreezReadinessEvidence } from "./breez-readiness";
import { MAINNET_LBTC_ASSET_ID, MAINNET_USDT_ASSET_ID } from "@/integrations/breez/config";

const now = new Date("2026-07-14T12:00:30.000Z");
const base: BreezReadinessEvidence = {
  sdkVersion: "0.12.4", network: "mainnet", lbtcAssetId: MAINNET_LBTC_ASSET_ID, usdtAssetId: MAINNET_USDT_ASSET_ID,
  usdtPrecision: 8, usdcConfigured: false, workingDirPersistent: true, operatorNamed: true,
  externalProbeEnabled: true, externalExecutionAttempted: false, routePrepared: true,
  routeFromAssetId: MAINNET_LBTC_ASSET_ID, routeToAssetId: MAINNET_USDT_ASSET_ID,
  receiverAmountUnits: 100_000_000n, estimatedAssetFeesUnits: 500_000n, maxSlippageBps: 100,
  quotePreparedAt: new Date("2026-07-14T12:00:00.000Z"), quoteExpiresAt: new Date("2026-07-14T12:01:00.000Z"),
  walletBtcSats: 1_000n, refundableCount: 0, unknownPaymentCount: 0, reconciliationMatched: true,
  backup: { attempted: true, verified: true, proofHash: "a".repeat(64), sourceSnapshotHash: "b".repeat(64), restoredSnapshotHash: "b".repeat(64) },
};

describe("Breez/USDt readiness decision", () => {
  it("returns GO only when every technical and operational proof passes", () => {
    const result = evaluateBreezReadiness(base, now);
    expect(result.status).toBe("GO");
    expect(result.checks.every((item) => item.passed)).toBe(true);
  });
  it("rejects a different asset, USDC or wrong precision", () => {
    expect(evaluateBreezReadiness({ ...base, usdtAssetId: "c".repeat(64) }, now).status).toBe("NO_GO");
    expect(evaluateBreezReadiness({ ...base, usdcConfigured: true }, now).status).toBe("NO_GO");
    expect(evaluateBreezReadiness({ ...base, usdtPrecision: 6 }, now).status).toBe("NO_GO");
  });
  it("rejects stale quote, excessive slippage and external execution", () => {
    expect(evaluateBreezReadiness({ ...base, quoteExpiresAt: now }, now).status).toBe("NO_GO");
    expect(evaluateBreezReadiness({ ...base, maxSlippageBps: 101 }, now).status).toBe("NO_GO");
    expect(evaluateBreezReadiness({ ...base, externalExecutionAttempted: true }, now).status).toBe("NO_GO");
  });
  it("rejects refundables, unknown results, divergence or failed restore", () => {
    expect(evaluateBreezReadiness({ ...base, refundableCount: 1 }, now).status).toBe("NO_GO");
    expect(evaluateBreezReadiness({ ...base, unknownPaymentCount: 1 }, now).status).toBe("NO_GO");
    expect(evaluateBreezReadiness({ ...base, reconciliationMatched: false }, now).status).toBe("NO_GO");
    expect(evaluateBreezReadiness({ ...base, backup: { ...base.backup, restoredSnapshotHash: "c".repeat(64) } }, now).status).toBe("NO_GO");
  });
});
