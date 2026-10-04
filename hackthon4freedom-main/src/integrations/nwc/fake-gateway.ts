import type { NwcFailureCode } from "@/domain/payer-payment";

import type { NwcGateway, NwcPaymentResult, NwcWalletInfo } from "./types";

export class FakeNwcGateway implements NwcGateway {
  readonly calls: string[] = [];

  constructor(private readonly scenario: {
    methods?: readonly string[];
    payment?: "SETTLED" | "UNKNOWN" | NwcFailureCode;
    feesPaidMsat?: bigint;
  } = {}) {}

  async getInfo(): Promise<NwcWalletInfo> {
    this.calls.push("getInfo");
    return {
      methods: this.scenario.methods ?? ["pay_invoice", "get_info"],
      encryptionModes: ["nip44_v2", "nip04"],
    };
  }

  async payInvoice(): Promise<NwcPaymentResult> {
    this.calls.push("payInvoice");
    const payment = this.scenario.payment ?? "SETTLED";
    if (payment === "SETTLED") return {
      status: "SETTLED",
      requestEventId: "a".repeat(64),
      responseEventId: "b".repeat(64),
      preimage: "c".repeat(64),
      feesPaidMsat: this.scenario.feesPaidMsat ?? 1_000n,
    };
    if (payment === "UNKNOWN" || payment === "UNKNOWN_RESULT") return {
      status: "UNKNOWN",
      requestEventId: "a".repeat(64),
      code: "UNKNOWN_RESULT",
    };
    return { status: "FAILED", code: payment };
  }
}
