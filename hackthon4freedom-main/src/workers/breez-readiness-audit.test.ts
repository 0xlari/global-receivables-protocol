// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadBreezMainnetConfig, MAINNET_LBTC_ASSET_ID, MAINNET_USDT_ASSET_ID } from "@/integrations/breez/config";
import type { BreezLiquidGateway } from "@/integrations/breez/types";
import { collectBreezReadiness } from "./breez-readiness-audit";

const now = new Date("2026-07-14T12:00:00.000Z");
function config(probes: boolean) {
  return loadBreezMainnetConfig({ BREEZ_ENABLE_MAINNET: "true", BREEZ_ENABLE_AUDIT_PROBES: String(probes), BREEZ_API_KEY: "runtime-only", BREEZ_MNEMONIC: "runtime-only", BREEZ_WORKING_DIR: "C:/breez-persistent" });
}
function gateway() {
  return {
    sync: vi.fn(async () => undefined),
    rescanOnchainSwaps: vi.fn(async () => undefined),
    getAuditSnapshot: vi.fn(async () => ({ snapshotHash: "a".repeat(64), fingerprintHash: "b".repeat(64), paymentsDigest: "c".repeat(64), btcSats: 1_000n, assetBalances: { [MAINNET_USDT_ASSET_ID]: 0n }, refundableCount: 0, unknownPaymentCount: 0 })),
    prepareAssetSwap: vi.fn(async () => ({ fromAssetId: MAINNET_LBTC_ASSET_ID, toAssetId: MAINNET_USDT_ASSET_ID, receiverAmountUnits: 100_000_000n, feesSats: 10n, estimatedAssetFeesUnits: 100_000n, preparedAt: now, expiresAt: new Date(now.getTime() + 60_000), opaquePrepareResponse: {} })),
    executeAssetSwap: vi.fn(),
  } as unknown as BreezLiquidGateway;
}

describe("Breez readiness collector", () => {
  it("prepares a route but never executes a swap", async () => {
    const fake = gateway();
    const result = await collectBreezReadiness({ gateway: fake, config: config(true), operatorNamed: true, workingDirPersistent: true, reconciliationMatched: true, backup: { attempted: true, verified: true, proofHash: "d".repeat(64), sourceSnapshotHash: "a".repeat(64), restoredSnapshotHash: "a".repeat(64) }, now });
    expect(fake.prepareAssetSwap).toHaveBeenCalledOnce();
    expect(fake.executeAssetSwap).not.toHaveBeenCalled();
    expect(result.decision.status).toBe("GO");
  });
  it("stays NO_GO and does not probe when the audit flag is off", async () => {
    const fake = gateway();
    const result = await collectBreezReadiness({ gateway: fake, config: config(false), operatorNamed: false, workingDirPersistent: true, reconciliationMatched: true, backup: { attempted: false, verified: false }, now });
    expect(fake.prepareAssetSwap).not.toHaveBeenCalled();
    expect(fake.executeAssetSwap).not.toHaveBeenCalled();
    expect(result.decision.status).toBe("NO_GO");
  });
});
