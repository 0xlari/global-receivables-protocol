import path from "node:path";

import { z } from "zod";

import { DomainError } from "@/domain/errors";

const assetId = z.string().regex(/^[a-f0-9]{64}$/);

export const MAINNET_LBTC_ASSET_ID = "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d";
export const MAINNET_USDT_ASSET_ID = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";
export const MAINNET_MAX_INVOICE_SATS = 1_000n;
export const MAINNET_MAX_SESSION_SATS = 5_000n;
export const MAINNET_MAX_HOT_WALLET_SATS = 10_000n;
export const MAINNET_USDT_PRECISION = 8;
export const MAINNET_AUDIT_MAX_SLIPPAGE_BPS = 100;

export type BreezMainnetConfig = Readonly<{
  network: "mainnet";
  enabled: boolean;
  controlledDemoEnabled: boolean;
  apiKey: string;
  mnemonic: string;
  workingDir: string;
  lbtcAssetId: string;
  usdtAssetId: string;
  maxReceiveFeeSats: bigint;
  maxInvoiceSats: bigint;
  maxSessionSats: bigint;
  maxHotWalletSats: bigint;
  auditProbesEnabled: boolean;
  auditMaxSlippageBps: number;
}>;

export function loadBreezMainnetConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): BreezMainnetConfig {
  const network = environment.BREEZ_NETWORK ?? "mainnet";
  if (network !== "mainnet") {
    throw new DomainError(
      "Esta integração foi autorizada somente para Breez mainnet.",
      "BREEZ_NETWORK_FORBIDDEN",
    );
  }

  const enabled = environment.BREEZ_ENABLE_MAINNET === "true";
  const controlledDemoEnabled = environment.BREEZ_ENABLE_CONTROLLED_DEMO === "true";
  const apiKey = environment.BREEZ_API_KEY ?? "";
  const mnemonic = environment.BREEZ_MNEMONIC ?? "";
  const lbtcAssetId = environment.BREEZ_MAINNET_LBTC_ASSET_ID ?? MAINNET_LBTC_ASSET_ID;
  const usdtAssetId = environment.BREEZ_MAINNET_USDT_ASSET_ID ?? MAINNET_USDT_ASSET_ID;
  const maxReceiveFeeSats = BigInt(environment.BREEZ_MAX_RECEIVE_FEE_SATS ?? "1000");
  const maxInvoiceSats = BigInt(environment.BREEZ_MAX_INVOICE_SATS ?? MAINNET_MAX_INVOICE_SATS.toString());
  const maxSessionSats = BigInt(environment.BREEZ_MAX_SESSION_SATS ?? MAINNET_MAX_SESSION_SATS.toString());
  const maxHotWalletSats = BigInt(environment.BREEZ_MAX_HOT_WALLET_SATS ?? MAINNET_MAX_HOT_WALLET_SATS.toString());
  const auditProbesEnabled = environment.BREEZ_ENABLE_AUDIT_PROBES === "true";
  const auditMaxSlippageBps = Number(environment.BREEZ_AUDIT_MAX_SLIPPAGE_BPS ?? MAINNET_AUDIT_MAX_SLIPPAGE_BPS);

  if (enabled) {
    if (!apiKey || !mnemonic || !assetId.safeParse(lbtcAssetId).success || !assetId.safeParse(usdtAssetId).success) {
      throw new DomainError(
        "Credenciais mainnet ausentes.",
        "BREEZ_MAINNET_CONFIG_INCOMPLETE",
      );
    }
  }
  if (lbtcAssetId !== MAINNET_LBTC_ASSET_ID || usdtAssetId !== MAINNET_USDT_ASSET_ID) {
    throw new DomainError("Asset ID mainnet fora da allowlist.", "BREEZ_ASSET_NOT_ALLOWED");
  }
  if (maxReceiveFeeSats < 0n) {
    throw new DomainError("Limite de tarifa inválido.", "INVALID_BREEZ_FEE_LIMIT");
  }
  if (maxInvoiceSats <= 0n || maxInvoiceSats > MAINNET_MAX_INVOICE_SATS || maxSessionSats <= 0n || maxSessionSats > MAINNET_MAX_SESSION_SATS || maxHotWalletSats <= 0n || maxHotWalletSats > MAINNET_MAX_HOT_WALLET_SATS) {
    throw new DomainError("Tetos mainnet excedem os guardrails aprovados.", "BREEZ_MAINNET_LIMIT_EXCEEDED");
  }
  if (auditProbesEnabled && !enabled) {
    throw new DomainError("A sondagem de auditoria exige mainnet explicitamente habilitada.", "BREEZ_AUDIT_REQUIRES_MAINNET");
  }
  if (controlledDemoEnabled && !enabled) {
    throw new DomainError("A demo controlada exige mainnet explicitamente habilitada.", "BREEZ_DEMO_REQUIRES_MAINNET");
  }
  if (!Number.isInteger(auditMaxSlippageBps) || auditMaxSlippageBps < 0 || auditMaxSlippageBps > MAINNET_AUDIT_MAX_SLIPPAGE_BPS) {
    throw new DomainError("Slippage de auditoria excede 1%.", "BREEZ_AUDIT_SLIPPAGE_EXCEEDED");
  }

  return Object.freeze({
    network: "mainnet",
    enabled,
    controlledDemoEnabled,
    apiKey,
    mnemonic,
    workingDir: path.resolve(environment.BREEZ_WORKING_DIR ?? ".breez-mainnet"),
    lbtcAssetId,
    usdtAssetId,
    maxReceiveFeeSats,
    maxInvoiceSats,
    maxSessionSats,
    maxHotWalletSats,
    auditProbesEnabled,
    auditMaxSlippageBps,
  });
}
