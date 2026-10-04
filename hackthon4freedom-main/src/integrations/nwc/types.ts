import type { NwcFailureCode } from "@/domain/payer-payment";

export type ParsedNwcConnection = Readonly<{
  walletServicePubkey: string;
  relayUrls: readonly string[];
  secret: string;
  lud16?: string;
}>;

export type NwcWalletInfo = Readonly<{
  methods: readonly string[];
  encryptionModes: readonly string[];
  budget?: Readonly<{ amountMsat: bigint; renewal?: string }>;
  expiresAt?: Date;
}>;

export type NwcPaymentResult =
  | Readonly<{
      status: "SETTLED";
      requestEventId: string;
      responseEventId: string;
      preimage: string;
      feesPaidMsat: bigint;
    }>
  | Readonly<{
      status: "FAILED";
      requestEventId?: string;
      responseEventId?: string;
      code: NwcFailureCode;
    }>
  | Readonly<{
      status: "UNKNOWN";
      requestEventId?: string;
      responseEventId?: string;
      code: NwcFailureCode;
    }>;

export interface NwcGateway {
  getInfo(connection: ParsedNwcConnection): Promise<NwcWalletInfo>;
  payInvoice(input: {
    connection: ParsedNwcConnection;
    invoice: string;
    amountMsat: bigint;
    maxFeeMsat: bigint;
    expiresAt: Date;
  }): Promise<NwcPaymentResult>;
}
