import path from "node:path";

import { hashReadinessProof, type BackupRestoreProof } from "@/domain/breez-readiness";
import { DomainError } from "@/domain/errors";
import type { BreezLiquidGateway } from "./types";

export async function verifyIsolatedBackupRestore(input: {
  source: BreezLiquidGateway;
  restored: BreezLiquidGateway;
  backupPath: string;
}): Promise<BackupRestoreProof> {
  if (!path.isAbsolute(input.backupPath)) {
    throw new DomainError("Backup de auditoria exige caminho absoluto fora do repositório.", "BREEZ_BACKUP_PATH_NOT_ABSOLUTE");
  }
  await input.source.sync();
  const source = await input.source.getAuditSnapshot();
  input.source.backup(input.backupPath);
  input.restored.restore(input.backupPath);
  await input.restored.rescanOnchainSwaps();
  await input.restored.sync();
  const restored = await input.restored.getAuditSnapshot();
  const verified = source.snapshotHash === restored.snapshotHash;
  return Object.freeze({
    attempted: true,
    verified,
    sourceSnapshotHash: source.snapshotHash,
    restoredSnapshotHash: restored.snapshotHash,
    proofHash: hashReadinessProof({ sourceSnapshotHash: source.snapshotHash, restoredSnapshotHash: restored.snapshotHash, verified }),
  });
}
