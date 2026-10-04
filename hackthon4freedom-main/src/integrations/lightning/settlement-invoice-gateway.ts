import { createHash } from "node:crypto";

export type SettlementInvoice = Readonly<{
  id: string;
  bolt11: string;
  paymentHash: string;
  amountMsat: bigint;
  expiresAt: Date;
}>;

export interface SettlementInvoiceGateway {
  createInvoice(input: {
    idempotencyKey: string;
    amountMsat: bigint;
    description: string;
    expiresAt: Date;
  }): Promise<SettlementInvoice>;
}

export class FakeSettlementInvoiceGateway implements SettlementInvoiceGateway {
  readonly calls: string[] = [];
  private readonly invoices = new Map<string, SettlementInvoice>();

  async createInvoice(input: {
    idempotencyKey: string;
    amountMsat: bigint;
    description: string;
    expiresAt: Date;
  }): Promise<SettlementInvoice> {
    this.calls.push(input.idempotencyKey);
    const existing = this.invoices.get(input.idempotencyKey);
    if (existing) return existing;
    const digest = createHash("sha256").update(input.idempotencyKey).digest("hex");
    const invoice = {
      id: `invoice-${digest.slice(0, 24)}`,
      bolt11: `lnbc${input.amountMsat.toString()}n1demo${digest}`,
      paymentHash: digest,
      amountMsat: input.amountMsat,
      expiresAt: input.expiresAt,
    };
    this.invoices.set(input.idempotencyKey, invoice);
    return invoice;
  }
}
