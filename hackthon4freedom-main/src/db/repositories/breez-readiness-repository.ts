import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import { mainnetReadinessAudits } from "@/db/schema";
import { hashReadinessProof, type BreezReadinessEvidence, type ReadinessCheck } from "@/domain/breez-readiness";
import { DomainError } from "@/domain/errors";

export async function recordBreezReadinessAudit<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  input: {
    id: string;
    idempotencyKey: string;
    evidence: BreezReadinessEvidence;
    decision: Readonly<{ status: "GO" | "NO_GO"; allChecksPassed: boolean; checks: readonly ReadinessCheck[] }>;
    completedAt: Date;
  },
) {
  const report = {
    ...input.evidence,
    receiverAmountUnits: input.evidence.receiverAmountUnits?.toString(),
    estimatedAssetFeesUnits: input.evidence.estimatedAssetFeesUnits?.toString(),
    walletBtcSats: input.evidence.walletBtcSats.toString(),
    quotePreparedAt: input.evidence.quotePreparedAt?.toISOString(),
    quoteExpiresAt: input.evidence.quoteExpiresAt?.toISOString(),
    backup: input.evidence.backup,
    decision: input.decision,
  };
  const reportHash = hashReadinessProof(report);
  const [existing] = await db.select().from(mainnetReadinessAudits).where(eq(mainnetReadinessAudits.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing) {
    if (existing.reportHash !== reportHash) throw new DomainError("Chave de auditoria reutilizada com outro relatório.", "BREEZ_AUDIT_IDEMPOTENCY_CONFLICT");
    return { auditId: existing.id, status: existing.status, reportHash, duplicate: true };
  }
  await db.insert(mainnetReadinessAudits).values({
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    reportHash,
    status: input.decision.status,
    allChecksPassed: input.decision.allChecksPassed,
    sdkVersion: input.evidence.sdkVersion,
    network: input.evidence.network,
    lbtcAssetId: input.evidence.lbtcAssetId,
    usdtAssetId: input.evidence.usdtAssetId,
    usdtPrecision: input.evidence.usdtPrecision,
    usdcConfigured: input.evidence.usdcConfigured,
    workingDirPersistent: input.evidence.workingDirPersistent,
    operatorNamed: input.evidence.operatorNamed,
    maxSlippageBps: input.evidence.maxSlippageBps,
    externalProbeEnabled: input.evidence.externalProbeEnabled,
    externalExecutionAttempted: input.evidence.externalExecutionAttempted,
    routePrepared: input.evidence.routePrepared,
    receiverAmountUnits: input.evidence.receiverAmountUnits,
    estimatedAssetFeesUnits: input.evidence.estimatedAssetFeesUnits,
    quotePreparedAt: input.evidence.quotePreparedAt,
    quoteExpiresAt: input.evidence.quoteExpiresAt,
    walletBtcSats: input.evidence.walletBtcSats,
    refundableCount: input.evidence.refundableCount,
    unknownPaymentCount: input.evidence.unknownPaymentCount,
    reconciliationMatched: input.evidence.reconciliationMatched,
    backupRestoreVerified: input.evidence.backup.verified,
    backupProofHash: input.evidence.backup.proofHash,
    checks: input.decision.checks,
    completedAt: input.completedAt,
  });
  return { auditId: input.id, status: input.decision.status, reportHash, duplicate: false };
}
