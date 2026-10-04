import { describe, expect, it } from "vitest";

import type { BindingLiquidSdk, LNInvoice } from "@breeztech/breez-sdk-liquid/node";

import {
  loadBreezMainnetConfig,
  MAINNET_LBTC_ASSET_ID,
  MAINNET_USDT_ASSET_ID,
} from "./config";
import { assetUnitsToSdkAmount, BreezSdkGateway, sdkAssetAmountToUnits } from "./sdk-gateway";

const baseConfig = {
  lbtcAssetId: MAINNET_LBTC_ASSET_ID,
  usdtAssetId: MAINNET_USDT_ASSET_ID,
  maxReceiveFeeSats: 100n,
  maxInvoiceSats: 1_000n,
  maxHotWalletSats: 10_000n,
};

function invoice(amountSats = 500): LNInvoice {
  return {
    bolt11: "lnbc-mainnet-fixture",
    network: "bitcoin",
    payeePubkey: "02".padEnd(66, "0"),
    paymentHash: "a".repeat(64),
    amountMsat: amountSats * 1_000,
    timestamp: 1_784_059_200,
    expiry: 60,
    routingHints: [],
    paymentSecret: [],
    minFinalCltvExpiryDelta: 18,
  };
}

describe("Breez Liquid mainnet guardrails", () => {
  it("preserva exatamente as oito casas entre unidades inteiras e o SDK", () => {
    expect(assetUnitsToSdkAmount(1n)).toBe(0.00000001);
    expect(sdkAssetAmountToUnits(0.00000001)).toBe(1n);
    expect(sdkAssetAmountToUnits(assetUnitsToSdkAmount(123_456_789n))).toBe(123_456_789n);
    expect(() => sdkAssetAmountToUnits(Number.POSITIVE_INFINITY)).toThrowError(expect.objectContaining({ code: "BREEZ_UNSAFE_ASSET_NUMBER" }));
  });
  it("fica desligado por padrão e rejeita outra rede", () => {
    expect(loadBreezMainnetConfig({}).enabled).toBe(false);
    expect(() => loadBreezMainnetConfig({ BREEZ_NETWORK: "testnet" })).toThrowError(expect.objectContaining({ code: "BREEZ_NETWORK_FORBIDDEN" }));
  });

  it("exige segredos fora do Git e não permite elevar os tetos", () => {
    expect(() => loadBreezMainnetConfig({ BREEZ_ENABLE_MAINNET: "true" })).toThrowError(expect.objectContaining({ code: "BREEZ_MAINNET_CONFIG_INCOMPLETE" }));
    expect(() => loadBreezMainnetConfig({ BREEZ_MAX_INVOICE_SATS: "1001" })).toThrowError(expect.objectContaining({ code: "BREEZ_MAINNET_LIMIT_EXCEEDED" }));
    expect(() => loadBreezMainnetConfig({ BREEZ_ENABLE_AUDIT_PROBES: "true" })).toThrowError(expect.objectContaining({ code: "BREEZ_AUDIT_REQUIRES_MAINNET" }));
    expect(() => loadBreezMainnetConfig({ BREEZ_ENABLE_CONTROLLED_DEMO: "true" })).toThrowError(expect.objectContaining({ code: "BREEZ_DEMO_REQUIRES_MAINNET" }));
    expect(() => loadBreezMainnetConfig({ BREEZ_AUDIT_MAX_SLIPPAGE_BPS: "101" })).toThrowError(expect.objectContaining({ code: "BREEZ_AUDIT_SLIPPAGE_EXCEEDED" }));
  });

  it("prepara invoice com valor exato e bloqueia tarifa excessiva", async () => {
    const sdk = {
      prepareReceivePayment: async () => ({ paymentMethod: "bolt11Invoice", feesSat: 25 }),
      receivePayment: async () => ({ destination: "lnbc-mainnet-fixture" }),
    } as unknown as BindingLiquidSdk;
    const gateway = new BreezSdkGateway(sdk, () => invoice(), baseConfig);
    await expect(gateway.createLightningInvoice({ amountSats: 500n, description: "Aporte" })).resolves.toMatchObject({ amountSats: 500n, feesSats: 25n, paymentHash: "a".repeat(64) });

    const expensive = new BreezSdkGateway({ ...sdk, prepareReceivePayment: async () => ({ paymentMethod: "bolt11Invoice", feesSat: 101 }) } as unknown as BindingLiquidSdk, () => invoice(), baseConfig);
    await expect(expensive.createLightningInvoice({ amountSats: 500n, description: "Aporte" })).rejects.toMatchObject({ code: "BREEZ_FEE_LIMIT_EXCEEDED" });
  });

  it("limita ativos, slippage e saldo da carteira quente", async () => {
    const sdk = {
      prepareReceivePayment: async () => ({ paymentMethod: "liquidAddress", feesSat: 0 }),
      receivePayment: async () => ({ destination: "liquid-address" }),
      prepareSendPayment: async () => ({ destination: { type: "liquidAddress", addressData: { address: "x", network: "bitcoin" } }, feesSat: 5, estimatedAssetFees: 0.001 }),
      getInfo: async () => ({ walletInfo: { balanceSat: 10_001, assetBalances: [], pendingSendSat: 0, pendingReceiveSat: 0, fingerprint: "f", pubkey: "p" }, blockchainInfo: {} }),
    } as unknown as BindingLiquidSdk;
    const gateway = new BreezSdkGateway(sdk, () => invoice(), baseConfig);
    await expect(gateway.prepareAssetSwap({ fromAssetId: MAINNET_LBTC_ASSET_ID, toAssetId: MAINNET_USDT_ASSET_ID, receiverAmountUnits: 100_000_000n, maxSlippageBps: 20 })).resolves.toMatchObject({ estimatedAssetFeesUnits: 100_000n });
    await expect(gateway.prepareAssetSwap({ fromAssetId: MAINNET_LBTC_ASSET_ID, toAssetId: MAINNET_USDT_ASSET_ID, receiverAmountUnits: 100_000_000n, maxSlippageBps: 5 })).rejects.toMatchObject({ code: "BREEZ_SLIPPAGE_EXCEEDED" });
    await expect(gateway.prepareAssetSwap({ fromAssetId: "b".repeat(64), toAssetId: MAINNET_USDT_ASSET_ID, receiverAmountUnits: 100_000_000n, maxSlippageBps: 20 })).rejects.toMatchObject({ code: "BREEZ_ASSET_NOT_ALLOWED" });
    await expect(gateway.getBalances()).rejects.toMatchObject({ code: "BREEZ_HOT_WALLET_LIMIT_EXCEEDED" });
  });
});
