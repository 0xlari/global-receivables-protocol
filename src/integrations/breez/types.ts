export type BreezPaymentState =
  | "PENDING"
  | "SETTLED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDABLE"
  | "UNKNOWN";

export type BreezPaymentEvent = Readonly<{
  eventType: string;
  externalReference: string;
  state: BreezPaymentState;
  amountSats: bigint;
  feesSats: bigint;
  occurredAt: Date;
}>;

export type LightningInvoice = Readonly<{
  invoice: string;
  paymentHash: string;
  amountSats: bigint;
  feesSats: bigint;
  expiresAt: Date;
}>;

export type PreparedAssetSwap = Readonly<{
  fromAssetId: string;
  toAssetId: string;
  receiverAmountUnits: bigint;
  feesSats: bigint;
  estimatedAssetFeesUnits: bigint;
  preparedAt: Date;
  expiresAt: Date;
  opaquePrepareResponse: unknown;
}>;

export type BreezAuditSnapshot = Readonly<{
  snapshotHash: string;
  fingerprintHash: string;
  paymentsDigest: string;
  btcSats: bigint;
  assetBalances: Readonly<Record<string, bigint>>;
  refundableCount: number;
  unknownPaymentCount: number;
}>;

export type ExecutedAssetSwap = Readonly<{
  externalReference: string;
  state: BreezPaymentState;
}>;

export interface BreezLiquidGateway {
  createLightningInvoice(input: {
    amountSats: bigint;
    description: string;
  }): Promise<LightningInvoice>;
  prepareAssetSwap(input: {
    fromAssetId: string;
    toAssetId: string;
    receiverAmountUnits: bigint;
    maxSlippageBps: number;
  }): Promise<PreparedAssetSwap>;
  executeAssetSwap(prepared: PreparedAssetSwap): Promise<ExecutedAssetSwap>;
  sync(): Promise<void>;
  listPayments(): Promise<readonly BreezPaymentEvent[]>;
  getBalances(): Promise<Readonly<{ btcSats: bigint; assetBalances: Readonly<Record<string, bigint>> }>>;
  rescanOnchainSwaps(): Promise<void>;
  getAuditSnapshot(): Promise<BreezAuditSnapshot>;
  subscribe(listener: (event: BreezPaymentEvent) => void): Promise<() => Promise<void>>;
  backup(path?: string): void;
  restore(path?: string): void;
  disconnect(): Promise<void>;
}
