import { createHash } from "node:crypto";

import { DomainError } from "@/domain/errors";

import type {
  BreezLiquidGateway,
  BreezPaymentEvent,
  BreezPaymentState,
  ExecutedAssetSwap,
  LightningInvoice,
  PreparedAssetSwap,
} from "./types";
import type { BreezMainnetConfig } from "./config";

import type {
  BindingLiquidSdk,
  LNInvoice,
  Payment,
  PrepareSendResponse,
  SdkEvent,
} from "@breeztech/breez-sdk-liquid/node";

const ASSET_PRECISION = 100_000_000n;

export function assetUnitsToSdkAmount(value: bigint) {
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainError("Valor do ativo fora do intervalo seguro.", "INVALID_AMOUNT");
  }
  const amount = Number(value) / Number(ASSET_PRECISION);
  if (BigInt(Math.round(amount * Number(ASSET_PRECISION))) !== value) {
    throw new DomainError("Valor do ativo perde precisão na fronteira do SDK.", "BREEZ_ASSET_PRECISION_LOSS");
  }
  return amount;
}

export function sdkAssetAmountToUnits(value: number) {
  const scaled = value * Number(ASSET_PRECISION);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(scaled))) {
    throw new DomainError("Valor de ativo retornado pelo SDK é inseguro.", "BREEZ_UNSAFE_ASSET_NUMBER");
  }
  return BigInt(Math.round(scaled));
}

function bigintFromSdk(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(`${field} fora do intervalo seguro.`, "BREEZ_UNSAFE_NUMBER");
  }
  return BigInt(value);
}

function paymentReference(payment: Payment) {
  if (payment.details.type === "lightning" && payment.details.paymentHash) return payment.details.paymentHash;
  if (payment.details.type === "lightning" || payment.details.type === "bitcoin") return payment.details.swapId;
  return payment.txId ?? payment.destination;
}

function paymentState(status: Payment["status"]): BreezPaymentState {
  if (status === "complete") return "SETTLED";
  if (status === "failed") return "FAILED";
  if (status === "timedOut") return "EXPIRED";
  if (status === "refundable" || status === "refundPending") return "REFUNDABLE";
  if (status === "created" || status === "pending" || status === "waitingFeeAcceptance") return "PENDING";
  return "UNKNOWN";
}

function normalizePayment(payment: Payment, eventType = `payment:${payment.status}`): BreezPaymentEvent {
  const externalReference = paymentReference(payment);
  if (!externalReference) {
    throw new DomainError("Pagamento Breez sem referência estável.", "BREEZ_PAYMENT_REFERENCE_MISSING");
  }
  const occurredAtSeconds = payment.details.type === "lightning" && payment.details.settledAt
    ? payment.details.settledAt
    : payment.timestamp;
  return Object.freeze({
    eventType,
    externalReference,
    state: paymentState(payment.status),
    amountSats: bigintFromSdk(payment.amountSat, "amountSat"),
    feesSats: bigintFromSdk(payment.feesSat, "feesSat"),
    occurredAt: new Date(occurredAtSeconds * 1_000),
  });
}

function paymentFromEvent(event: SdkEvent) {
  return "details" in event ? normalizePayment(event.details, event.type) : undefined;
}

export class BreezSdkGateway implements BreezLiquidGateway {
  constructor(
    private readonly sdk: BindingLiquidSdk,
    private readonly parseInvoice: (input: string) => LNInvoice,
    private readonly config: Pick<BreezMainnetConfig, "lbtcAssetId" | "usdtAssetId" | "maxReceiveFeeSats" | "maxInvoiceSats" | "maxHotWalletSats">,
  ) {}

  async createLightningInvoice(input: { amountSats: bigint; description: string }): Promise<LightningInvoice> {
    if (input.amountSats <= 0n || input.amountSats > this.config.maxInvoiceSats || input.amountSats > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new DomainError("Valor da invoice inválido.", "INVALID_AMOUNT");
    }
    const prepared = await this.sdk.prepareReceivePayment({
      paymentMethod: "bolt11Invoice",
      amount: { type: "bitcoin", payerAmountSat: Number(input.amountSats) },
    });
    const feesSats = bigintFromSdk(prepared.feesSat, "feesSat");
    if (feesSats > this.config.maxReceiveFeeSats) {
      throw new DomainError("Tarifa Breez acima do limite.", "BREEZ_FEE_LIMIT_EXCEEDED");
    }
    const received = await this.sdk.receivePayment({
      prepareResponse: prepared,
      description: input.description.slice(0, 120),
    });
    const invoice = this.parseInvoice(received.destination);
    const invoiceAmount = invoice.amountMsat === undefined ? undefined : BigInt(invoice.amountMsat) / 1_000n;
    if (!invoice.paymentHash || invoiceAmount !== input.amountSats) {
      throw new DomainError("Invoice Breez não corresponde ao valor preparado.", "BREEZ_INVOICE_MISMATCH");
    }
    return Object.freeze({
      invoice: received.destination,
      paymentHash: invoice.paymentHash,
      amountSats: input.amountSats,
      feesSats,
      expiresAt: new Date((invoice.timestamp + invoice.expiry) * 1_000),
    });
  }

  async prepareAssetSwap(input: { fromAssetId: string; toAssetId: string; receiverAmountUnits: bigint; maxSlippageBps: number }): Promise<PreparedAssetSwap> {
    const allowlist = new Set([this.config.lbtcAssetId, this.config.usdtAssetId]);
    if (!allowlist.has(input.fromAssetId) || !allowlist.has(input.toAssetId) || input.fromAssetId === input.toAssetId) {
      throw new DomainError("Ativo fora da allowlist mainnet.", "BREEZ_ASSET_NOT_ALLOWED");
    }
    if (!Number.isInteger(input.maxSlippageBps) || input.maxSlippageBps < 0 || input.maxSlippageBps > 500) {
      throw new DomainError("Slippage fora do limite.", "INVALID_SLIPPAGE");
    }
    const receiverAmount = assetUnitsToSdkAmount(input.receiverAmountUnits);
    const receive = await this.sdk.prepareReceivePayment({
      paymentMethod: "liquidAddress",
      amount: { type: "asset", assetId: input.toAssetId, payerAmount: receiverAmount },
    });
    const destination = await this.sdk.receivePayment({ prepareResponse: receive });
    const prepared = await this.sdk.prepareSendPayment({
      destination: destination.destination,
      amount: {
        type: "asset",
        toAsset: input.toAssetId,
        fromAsset: input.fromAssetId,
        receiverAmount,
        estimateAssetFees: true,
      },
    });
    const estimatedAssetFeesUnits = sdkAssetAmountToUnits(prepared.estimatedAssetFees ?? 0);
    if (estimatedAssetFeesUnits * 10_000n > input.receiverAmountUnits * BigInt(input.maxSlippageBps)) {
      throw new DomainError("Custo do swap excede o slippage aceito.", "BREEZ_SLIPPAGE_EXCEEDED");
    }
    const preparedAt = new Date();
    return Object.freeze({
      fromAssetId: input.fromAssetId,
      toAssetId: input.toAssetId,
      receiverAmountUnits: input.receiverAmountUnits,
      feesSats: bigintFromSdk(prepared.feesSat ?? 0, "feesSat"),
      estimatedAssetFeesUnits,
      preparedAt,
      expiresAt: new Date(preparedAt.getTime() + 60_000),
      opaquePrepareResponse: prepared,
    });
  }

  async executeAssetSwap(prepared: PreparedAssetSwap): Promise<ExecutedAssetSwap> {
    const response = await this.sdk.sendPayment({
      prepareResponse: prepared.opaquePrepareResponse as PrepareSendResponse,
    });
    const normalized = normalizePayment(response.payment);
    return Object.freeze({ externalReference: normalized.externalReference, state: normalized.state });
  }

  async sync() { await this.sdk.sync(); }
  async listPayments() { return (await this.sdk.listPayments({})).map((payment) => normalizePayment(payment)); }
  async getBalances() {
    const info = await this.sdk.getInfo();
    const btcSats = bigintFromSdk(info.walletInfo.balanceSat, "balanceSat");
    if (btcSats > this.config.maxHotWalletSats) {
      throw new DomainError("Carteira quente excede o teto mainnet.", "BREEZ_HOT_WALLET_LIMIT_EXCEEDED");
    }
    return Object.freeze({
      btcSats,
      assetBalances: Object.freeze(Object.fromEntries(info.walletInfo.assetBalances.map((asset) => [asset.assetId, bigintFromSdk(asset.balanceSat, "assetBalance")]))),
    });
  }
  async rescanOnchainSwaps() { await this.sdk.rescanOnchainSwaps(); }
  async getAuditSnapshot() {
    const [info, payments, refundables] = await Promise.all([
      this.sdk.getInfo(),
      this.sdk.listPayments({}),
      this.sdk.listRefundables(),
    ]);
    const btcSats = bigintFromSdk(info.walletInfo.balanceSat, "balanceSat");
    if (btcSats > this.config.maxHotWalletSats) {
      throw new DomainError("Carteira quente excede o teto mainnet.", "BREEZ_HOT_WALLET_LIMIT_EXCEEDED");
    }
    const assetBalances = Object.freeze(
      Object.fromEntries(
        info.walletInfo.assetBalances.map((asset) => [
          asset.assetId,
          bigintFromSdk(asset.balanceSat, "assetBalance"),
        ]),
      ),
    );
    const normalized = payments.map((payment) => normalizePayment(payment)).sort((a, b) => a.externalReference.localeCompare(b.externalReference));
    const paymentsDigest = createHash("sha256").update(JSON.stringify(normalized.map((payment) => ({ ...payment, amountSats: payment.amountSats.toString(), feesSats: payment.feesSats.toString(), occurredAt: payment.occurredAt.toISOString() })))).digest("hex");
    const fingerprintHash = createHash("sha256").update(info.walletInfo.fingerprint).digest("hex");
    const snapshotHash = createHash("sha256").update(JSON.stringify({ fingerprintHash, paymentsDigest, btcSats: btcSats.toString(), assetBalances: Object.fromEntries(Object.entries(assetBalances).sort(([a], [b]) => a.localeCompare(b)).map(([assetId, amount]) => [assetId, amount.toString()])), refundableCount: refundables.length })).digest("hex");
    return Object.freeze({ snapshotHash, fingerprintHash, paymentsDigest, btcSats, assetBalances, refundableCount: refundables.length, unknownPaymentCount: normalized.filter((payment) => payment.state === "UNKNOWN").length });
  }
  async subscribe(listener: (event: BreezPaymentEvent) => void) {
    const id = await this.sdk.addEventListener({ onEvent: (event) => { const payment = paymentFromEvent(event); if (payment) listener(payment); } });
    return async () => { await this.sdk.removeEventListener(id); };
  }
  backup(path?: string) { this.sdk.backup({ backupPath: path }); }
  restore(path?: string) { this.sdk.restore({ backupPath: path }); }
  async disconnect() { await this.sdk.disconnect(); }
}

export async function connectBreezMainnet(config: BreezMainnetConfig): Promise<BreezSdkGateway> {
  if (!config.enabled) {
    throw new DomainError("Breez mainnet está desabilitado.", "BREEZ_MAINNET_DISABLED");
  }
  const breezModule = await import("@breeztech/breez-sdk-liquid/node");
  const sdkConfig = breezModule.defaultConfig("mainnet", config.apiKey);
  sdkConfig.workingDir = config.workingDir;
  const sdk = await breezModule.connect({ config: sdkConfig, mnemonic: config.mnemonic });
  return new BreezSdkGateway(sdk, breezModule.parseInvoice, config);
}
