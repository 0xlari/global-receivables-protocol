// @vitest-environment node
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { verifyIsolatedBackupRestore } from "./backup-audit";
import type { BreezAuditSnapshot, BreezLiquidGateway } from "./types";

const snapshot: BreezAuditSnapshot = { snapshotHash: "a".repeat(64), fingerprintHash: "b".repeat(64), paymentsDigest: "c".repeat(64), btcSats: 0n, assetBalances: {}, refundableCount: 0, unknownPaymentCount: 0 };
function auditGateway(value: BreezAuditSnapshot) {
  return { sync: vi.fn(async () => undefined), getAuditSnapshot: vi.fn(async () => value), backup: vi.fn(), restore: vi.fn(), rescanOnchainSwaps: vi.fn(async () => undefined) } as unknown as BreezLiquidGateway;
}

describe("Breez isolated backup/restore proof", () => {
  it("matches source and restored snapshots without exposing wallet data", async () => {
    const source = auditGateway(snapshot); const restored = auditGateway(snapshot);
    const result = await verifyIsolatedBackupRestore({ source, restored, backupPath: path.resolve("C:/breez-audit/backup.bin") });
    expect(result).toMatchObject({ attempted: true, verified: true, sourceSnapshotHash: snapshot.snapshotHash, restoredSnapshotHash: snapshot.snapshotHash });
    expect(result.proofHash).toMatch(/^[a-f0-9]{64}$/);
    expect(source.backup).toHaveBeenCalledOnce(); expect(restored.restore).toHaveBeenCalledOnce();
  });
  it("fails proof when restored state diverges and rejects relative paths", async () => {
    const divergent = { ...snapshot, snapshotHash: "d".repeat(64) };
    await expect(verifyIsolatedBackupRestore({ source: auditGateway(snapshot), restored: auditGateway(divergent), backupPath: path.resolve("C:/breez-audit/backup.bin") })).resolves.toMatchObject({ verified: false });
    await expect(verifyIsolatedBackupRestore({ source: auditGateway(snapshot), restored: auditGateway(snapshot), backupPath: "backup.bin" })).rejects.toMatchObject({ code: "BREEZ_BACKUP_PATH_NOT_ABSOLUTE" });
  });
});
