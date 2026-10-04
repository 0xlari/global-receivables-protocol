import {
  BREEZ_AUDITED_SDK_VERSION,
  evaluateBreezReadiness,
  LIQUID_ASSET_PRECISION,
  type BackupRestoreProof,
} from "@/domain/breez-readiness";
import type { BreezMainnetConfig } from "@/integrations/breez/config";
import type { BreezLiquidGateway } from "@/integrations/breez/types";

export async function collectBreezReadiness(input: {
  gateway: BreezLiquidGateway;
  config: BreezMainnetConfig;
  operatorNamed: boolean;
  workingDirPersistent: boolean;
  reconciliationMatched: boolean;
  backup: BackupRestoreProof;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await input.gateway.sync();
  await input.gateway.rescanOnchainSwaps();
  const snapshot = await input.gateway.getAuditSnapshot();
  const prepared = input.config.auditProbesEnabled
    ? await input.gateway.prepareAssetSwap({
        fromAssetId: input.config.lbtcAssetId,
        toAssetId: input.config.usdtAssetId,
        receiverAmountUnits: 100_000_000n,
        maxSlippageBps: input.config.auditMaxSlippageBps,
      })
    : undefined;

  const evidence = Object.freeze({
    sdkVersion: BREEZ_AUDITED_SDK_VERSION,
    network: input.config.network,
    lbtcAssetId: input.config.lbtcAssetId,
    usdtAssetId: input.config.usdtAssetId,
    usdtPrecision: LIQUID_ASSET_PRECISION,
    usdcConfigured: false,
    workingDirPersistent: input.workingDirPersistent,
    operatorNamed: input.operatorNamed,
    externalProbeEnabled: input.config.auditProbesEnabled,
    externalExecutionAttempted: false,
    routePrepared: Boolean(prepared),
    routeFromAssetId: prepared?.fromAssetId,
    routeToAssetId: prepared?.toAssetId,
    receiverAmountUnits: prepared?.receiverAmountUnits,
    estimatedAssetFeesUnits: prepared?.estimatedAssetFeesUnits,
    maxSlippageBps: input.config.auditMaxSlippageBps,
    quotePreparedAt: prepared?.preparedAt,
    quoteExpiresAt: prepared?.expiresAt,
    walletBtcSats: snapshot.btcSats,
    refundableCount: snapshot.refundableCount,
    unknownPaymentCount: snapshot.unknownPaymentCount,
    reconciliationMatched: input.reconciliationMatched,
    backup: input.backup,
  });
  return Object.freeze({ evidence, decision: evaluateBreezReadiness(evidence, now) });
}
