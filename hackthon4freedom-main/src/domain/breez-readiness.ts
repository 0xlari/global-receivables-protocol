import { createHash } from "node:crypto";

import {
  MAINNET_LBTC_ASSET_ID,
  MAINNET_MAX_HOT_WALLET_SATS,
  MAINNET_USDT_ASSET_ID,
} from "@/integrations/breez/config";

export const BREEZ_AUDITED_SDK_VERSION = "0.12.4";
export const LIQUID_ASSET_PRECISION = 8;
export const AUDIT_MAX_SLIPPAGE_BPS = 100;

export type BackupRestoreProof = Readonly<{
  attempted: boolean;
  verified: boolean;
  proofHash?: string;
  sourceSnapshotHash?: string;
  restoredSnapshotHash?: string;
}>;

export type BreezReadinessEvidence = Readonly<{
  sdkVersion: string;
  network: string;
  lbtcAssetId: string;
  usdtAssetId: string;
  usdtPrecision: number;
  usdcConfigured: boolean;
  workingDirPersistent: boolean;
  operatorNamed: boolean;
  externalProbeEnabled: boolean;
  externalExecutionAttempted: boolean;
  routePrepared: boolean;
  routeFromAssetId?: string;
  routeToAssetId?: string;
  receiverAmountUnits?: bigint;
  estimatedAssetFeesUnits?: bigint;
  maxSlippageBps: number;
  quotePreparedAt?: Date;
  quoteExpiresAt?: Date;
  walletBtcSats: bigint;
  refundableCount: number;
  unknownPaymentCount: number;
  reconciliationMatched: boolean;
  backup: BackupRestoreProof;
}>;

export type ReadinessCheck = Readonly<{
  code: string;
  passed: boolean;
  detail: string;
}>;

function check(code: string, passed: boolean, detail: string): ReadinessCheck {
  return Object.freeze({ code, passed, detail });
}

export function hashReadinessProof(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function evaluateBreezReadiness(evidence: BreezReadinessEvidence, now = new Date()) {
  const receiver = evidence.receiverAmountUnits ?? 0n;
  const assetFees = evidence.estimatedAssetFeesUnits ?? -1n;
  const quoteFresh = Boolean(
    evidence.quotePreparedAt &&
      evidence.quoteExpiresAt &&
      evidence.quotePreparedAt <= now &&
      evidence.quoteExpiresAt > now &&
      evidence.quoteExpiresAt.getTime() - evidence.quotePreparedAt.getTime() <= 60_000,
  );
  const slippageSafe =
    Number.isInteger(evidence.maxSlippageBps) &&
    evidence.maxSlippageBps >= 0 &&
    evidence.maxSlippageBps <= AUDIT_MAX_SLIPPAGE_BPS &&
    receiver > 0n &&
    assetFees >= 0n &&
    assetFees * 10_000n <= receiver * BigInt(evidence.maxSlippageBps);

  const checks = Object.freeze([
    check("SDK_VERSION_PINNED", evidence.sdkVersion === BREEZ_AUDITED_SDK_VERSION, "Versão do SDK precisa coincidir com a versão auditada."),
    check("MAINNET_ASSET_ALLOWLIST", evidence.network === "mainnet" && evidence.lbtcAssetId === MAINNET_LBTC_ASSET_ID && evidence.usdtAssetId === MAINNET_USDT_ASSET_ID && !evidence.usdcConfigured, "Somente L-BTC e Tether USDt oficiais da Liquid mainnet são aceitos."),
    check("USDT_PRECISION", evidence.usdtPrecision === LIQUID_ASSET_PRECISION, "USDt deve usar precisão de oito casas."),
    check("PERSISTENT_WORKING_DIR", evidence.workingDirPersistent, "O diretório do SDK precisa ser persistente e exclusivo."),
    check("OPERATOR_NAMED", evidence.operatorNamed, "Uma pessoa responsável pela carteira e interrupção precisa estar nomeada."),
    check("PREPARE_ONLY", evidence.externalProbeEnabled && !evidence.externalExecutionAttempted, "A auditoria prepara a rota, mas nunca executa pagamento ou swap."),
    check("USDT_ROUTE_AVAILABLE", evidence.routePrepared && evidence.routeFromAssetId === MAINNET_LBTC_ASSET_ID && evidence.routeToAssetId === MAINNET_USDT_ASSET_ID, "Uma rota preparada L-BTC → USDt precisa existir."),
    check("QUOTE_FRESH", quoteFresh, "A cotação de auditoria deve expirar em até 60 segundos."),
    check("SLIPPAGE_WITHIN_LIMIT", slippageSafe, "Custos estimados devem respeitar o teto operacional de 1%."),
    check("NO_REFUNDABLE_SWAPS", evidence.refundableCount === 0, "Swaps reembolsáveis pendentes bloqueiam a operação."),
    check("NO_UNKNOWN_RESULTS", evidence.unknownPaymentCount === 0, "Resultados desconhecidos bloqueiam retry e abertura."),
    check("HOT_WALLET_LIMIT", evidence.walletBtcSats >= 0n && evidence.walletBtcSats <= MAINNET_MAX_HOT_WALLET_SATS, "Saldo BTC precisa permanecer dentro do teto de 10.000 sats."),
    check("LEDGER_RECONCILED", evidence.reconciliationMatched, "Saldos externos e ledger precisam estar conciliados."),
    check("BACKUP_RESTORE_VERIFIED", evidence.backup.attempted && evidence.backup.verified && Boolean(evidence.backup.proofHash?.match(/^[a-f0-9]{64}$/)) && evidence.backup.sourceSnapshotHash === evidence.backup.restoredSnapshotHash, "Backup e restauração isolada precisam produzir o mesmo snapshot."),
  ]);
  const allChecksPassed = checks.every((item) => item.passed);
  return Object.freeze({ status: allChecksPassed ? "GO" as const : "NO_GO" as const, allChecksPassed, checks });
}
