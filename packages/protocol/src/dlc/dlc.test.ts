import { describe, expect, it } from "vitest";
import { FakeDlcGateway } from ".";

const input = { poolEventId: "a".repeat(64), contributorPubkey: "b".repeat(64), originatorPubkey: "c".repeat(64), amountSats: 100_000n, refundAfter: 1_800_000_000, estimatedFeeSats: 2_000n };
describe("FakeDlcGateway", () => {
  it("é determinístico e aceita taxa de até 2% sem criar transação real", async () => { const gateway = new FakeDlcGateway(); expect((await gateway.createOffer(input)).offerId).toBe((await gateway.createOffer(input)).offerId); });
  it("rejeita taxa acima de 2%", async () => { await expect(new FakeDlcGateway().createOffer({ ...input, estimatedFeeSats: 2_001n })).rejects.toThrow("DLC_FEE_EXCEEDS_TWO_PERCENT"); });
});
