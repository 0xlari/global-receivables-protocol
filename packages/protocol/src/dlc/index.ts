import { createHash } from "node:crypto";
import { z } from "zod";

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
export const dlcFundingProofSchema = z.object({ contractId: z.string().min(8), fundingTxid: hex64, fundingVout: z.number().int().nonnegative(), amountSats: z.string().regex(/^[1-9]\d*$/), confirmations: z.number().int().nonnegative() }).strict();
export type DlcFundingProof = z.infer<typeof dlcFundingProofSchema>;
export type DlcOfferInput = Readonly<{ poolEventId: string; contributorPubkey: string; originatorPubkey: string; amountSats: bigint; refundAfter: number; estimatedFeeSats: bigint }>;
export type DlcOffer = Readonly<{ offerId: string; input: DlcOfferInput; network: "regtest-simulation" }>;
export type DlcAcceptInput = Readonly<{ offer: DlcOffer; contributorSignature: string }>;
export type DlcContract = Readonly<{ contractId: string; offerId: string; status: "ACCEPTED" }>;
export type DlcContractStatus = "OFFERED" | "ACCEPTED" | "FUNDED" | "REFUNDED" | "SETTLED";
export interface DlcGateway { createOffer(input: DlcOfferInput): Promise<DlcOffer>; acceptOffer(input: DlcAcceptInput): Promise<DlcContract>; getFundingProof(contractId: string): Promise<DlcFundingProof>; getContractStatus(contractId: string): Promise<DlcContractStatus>; }

const id = (prefix: string, value: unknown) => `${prefix}_${createHash("sha256").update(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item)).digest("hex")}`;
export class FakeDlcGateway implements DlcGateway {
  private readonly statuses = new Map<string, DlcContractStatus>();
  async createOffer(input: DlcOfferInput): Promise<DlcOffer> {
    if (input.amountSats <= 0n) throw new Error("DLC_AMOUNT_INVALID");
    if (input.estimatedFeeSats < 0n || input.estimatedFeeSats * 100n > input.amountSats * 2n) throw new Error("DLC_FEE_EXCEEDS_TWO_PERCENT");
    const offer = { offerId: id("offer", input), input, network: "regtest-simulation" as const }; this.statuses.set(offer.offerId, "OFFERED"); return offer;
  }
  async acceptOffer({ offer, contributorSignature }: DlcAcceptInput): Promise<DlcContract> { if (!contributorSignature) throw new Error("DLC_SIGNATURE_REQUIRED"); const contractId = id("contract", { offerId: offer.offerId, contributorSignature }); this.statuses.set(contractId, "ACCEPTED"); return { contractId, offerId: offer.offerId, status: "ACCEPTED" }; }
  async getFundingProof(contractId: string): Promise<DlcFundingProof> { const proof = { contractId, fundingTxid: createHash("sha256").update(contractId).digest("hex"), fundingVout: 0, amountSats: "1", confirmations: 0 }; return dlcFundingProofSchema.parse(proof); }
  async getContractStatus(contractId: string) { return this.statuses.get(contractId) ?? "OFFERED"; }
}
