import { nip04, nip47, SimplePool } from "nostr-tools";

import type { NwcFailureCode } from "@/domain/payer-payment";

import type { NwcGateway, NwcPaymentResult, NwcWalletInfo, ParsedNwcConnection } from "./types";

const NWC_INFO_KIND = 13_194;
const NWC_RESPONSE_KIND = 23_195;

function mapNwcCode(value: unknown): NwcFailureCode {
  const supported = new Set<NwcFailureCode>([
    "INSUFFICIENT_BALANCE", "QUOTA_EXCEEDED", "RESTRICTED", "UNAUTHORIZED",
    "RATE_LIMITED", "PAYMENT_FAILED", "NOT_IMPLEMENTED", "INTERNAL",
  ]);
  return typeof value === "string" && supported.has(value as NwcFailureCode)
    ? value as NwcFailureCode
    : "INVALID_RESPONSE";
}

export class RelayNwcGateway implements NwcGateway {
  constructor(private readonly timeoutMs = 8_000) {}

  private assertEnabled() {
    if (process.env.NWC_ENABLE_LIVE !== "true") throw new Error("NWC_LIVE_DISABLED");
  }

  async getInfo(connection: ParsedNwcConnection): Promise<NwcWalletInfo> {
    this.assertEnabled();
    const pool = new SimplePool();
    try {
      const events = await pool.querySync(
        [...connection.relayUrls],
        { kinds: [NWC_INFO_KIND], authors: [connection.walletServicePubkey], limit: 1 },
        { maxWait: this.timeoutMs },
      );
      const info = events.sort((a, b) => b.created_at - a.created_at)[0];
      if (!info) throw new Error("NWC_INFO_NOT_FOUND");
      return {
        methods: info.content.split(/\s+/).filter(Boolean),
        encryptionModes: info.tags.find((tag) => tag[0] === "encryption")?.[1]?.split(/\s+/) ?? ["nip04"],
      };
    } finally {
      pool.close([...connection.relayUrls]);
    }
  }

  async payInvoice(input: {
    connection: ParsedNwcConnection;
    invoice: string;
    amountMsat: bigint;
    maxFeeMsat: bigint;
    expiresAt: Date;
  }): Promise<NwcPaymentResult> {
    this.assertEnabled();
    const secretKey = Uint8Array.from(Buffer.from(input.connection.secret, "hex"));
    const request = await nip47.makeNwcRequestEvent(
      input.connection.walletServicePubkey,
      secretKey,
      input.invoice,
    );
    const pool = new SimplePool();
    try {
      await Promise.any(pool.publish([...input.connection.relayUrls], request));
      const responses = await pool.querySync(
        [...input.connection.relayUrls],
        { kinds: [NWC_RESPONSE_KIND], "#e": [request.id], limit: 1 },
        { maxWait: this.timeoutMs },
      );
      const response = responses[0];
      if (!response) return { status: "UNKNOWN", requestEventId: request.id, code: "UNKNOWN_RESULT" };
      const plaintext = await nip04.decrypt(secretKey, input.connection.walletServicePubkey, response.content);
      const payload = JSON.parse(plaintext) as {
        result_type?: string;
        error?: { code?: string } | null;
        result?: { preimage?: string; fees_paid?: number } | null;
      };
      if (payload.result_type !== "pay_invoice") {
        return { status: "FAILED", requestEventId: request.id, responseEventId: response.id, code: "INVALID_RESPONSE" };
      }
      if (payload.error) return {
        status: "FAILED",
        requestEventId: request.id,
        responseEventId: response.id,
        code: mapNwcCode(payload.error.code),
      };
      if (!payload.result?.preimage || !/^[a-f0-9]{64}$/i.test(payload.result.preimage)) {
        return { status: "FAILED", requestEventId: request.id, responseEventId: response.id, code: "INVALID_RESPONSE" };
      }
      const feesPaidMsat = BigInt(payload.result.fees_paid ?? 0);
      if (feesPaidMsat > input.maxFeeMsat) {
        return { status: "UNKNOWN", requestEventId: request.id, responseEventId: response.id, code: "UNKNOWN_RESULT" };
      }
      return {
        status: "SETTLED",
        requestEventId: request.id,
        responseEventId: response.id,
        preimage: payload.result.preimage,
        feesPaidMsat,
      };
    } catch (error) {
      if (error instanceof SyntaxError) return { status: "FAILED", requestEventId: request.id, code: "INVALID_RESPONSE" };
      return { status: "UNKNOWN", requestEventId: request.id, code: "UNKNOWN_RESULT" };
    } finally {
      pool.close([...input.connection.relayUrls]);
    }
  }
}
