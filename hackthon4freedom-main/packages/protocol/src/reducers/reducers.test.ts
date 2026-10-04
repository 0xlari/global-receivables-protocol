import { describe, expect, it } from "vitest";

import { FakeSigner } from "../../../nostr/src/signer";
import { buildProtocolEvent } from "../builders";
import type { ProtocolKind } from "../kinds";
import type { PoolCreated, PoolTransition, ProtocolContent, ProtocolSignedEvent } from "../schemas";
import { validContentVectors } from "../test-vectors/valid";
import { reducePoolState } from "./pool";
import { calculateLatePenaltyBps, validateTransition } from "./transition";

const provider = new FakeSigner(new Uint8Array(32).fill(21));
const originator = new FakeSigner(new Uint8Array(32).fill(22));

async function fixture() {
  const providerPubkey = await provider.getPublicKey(); const originatorPubkey = await originator.getPublicKey();
  const sign = async (index: number, signer: FakeSigner, overrides: Record<string, unknown> = {}) => {
    const vector = validContentVectors[index]!; const content = { ...vector.content, ...overrides } as ProtocolContent;
    if (content.event_type === "ReceivableCreated") content.provider_pubkey = providerPubkey;
    if (content.event_type === "ClientValidationDecision") content.client_pubkey = originatorPubkey;
    if (content.event_type === "NwcAuthorizationAttestation") content.executor_pubkey = originatorPubkey;
    return signer.signEvent(buildProtocolEvent(vector.kind as ProtocolKind, content));
  };
  const receivable = await sign(1, provider);
  const commitment = await sign(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey });
  const approval = await sign(3, originator, { receivable_event_id: receivable.id });
  const nwc = await sign(4, originator, { receivable_event_id: receivable.id });
  const pool = await sign(5, provider, { receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id, approval_event_id: approval.id, nwc_attestation_event_id: nwc.id, originator_pubkey: originatorPubkey });
  return { providerPubkey, originatorPubkey, receivable, commitment, approval, nwc, pool, events: [receivable, commitment, approval, nwc, pool] };
}

async function transition(pool: ProtocolSignedEvent, signer: FakeSigner, input: Partial<PoolTransition> & Pick<PoolTransition, "previous_event_id" | "previous_state" | "new_state">) {
  const vector = validContentVectors[6]!;
  const actorPubkey = await signer.getPublicKey();
  const content = { ...vector.content, transition_id: `transition_${input.new_state.toLowerCase()}_${input.previous_event_id.slice(0, 8)}`, pool_event_id: pool.id, actor_pubkey: actorPubkey, actor_role: signer === provider ? "PROVIDER" : "ORIGINATOR", transitioned_at: 1_800_700_000, ...input } as PoolTransition;
  return signer.signEvent(buildProtocolEvent(vector.kind as ProtocolKind, content));
}

describe("LRP reducers and authorities", () => {
  it("reconstructs the same pool from shuffled events without a database", async () => {
    const data = await fixture();
    const funding = await transition(data.pool, provider, { previous_event_id: data.pool.id, previous_state: "PUBLISHED", new_state: "FUNDING", funded_bps: 0 });
    const one = reducePoolState([...data.events, funding]);
    const two = reducePoolState(structuredClone([funding, ...data.events].reverse()));
    expect(one.pools[0]?.state).toBe("FUNDING");
    expect(two).toEqual(one);
  });

  it("rejects a transition signed by an actor without authority", async () => {
    const data = await fixture();
    const invalid = await transition(data.pool, originator, { previous_event_id: data.pool.id, previous_state: "PUBLISHED", new_state: "FUNDING", funded_bps: 0 });
    const result = reducePoolState([...data.events, invalid]);
    expect(result.pools[0]?.state).toBe("PUBLISHED");
    expect(result.rejected.some((item) => item.reason === "ORIGINATOR_NOT_AUTHORIZED")).toBe(true);
  });

  it("enforces 50 percent and the 24 hour partial decision window", async () => {
    const data = await fixture(); const pool = JSON.parse(data.pool.content) as PoolCreated;
    const pending = { ...(validContentVectors[6]!.content as PoolTransition), previous_state: "PARTIALLY_FUNDED", new_state: "PARTIAL_ACCEPTANCE_PENDING", actor_pubkey: data.originatorPubkey, actor_role: "ORIGINATOR", funded_bps: 4_999, transitioned_at: pool.funding_deadline } as PoolTransition;
    expect(validateTransition("PARTIALLY_FUNDED", pending, { pool, providerPubkey: data.providerPubkey })).toMatchObject({ valid: false, reason: "PARTIAL_MINIMUM_NOT_MET" });
    const accepted = { ...pending, previous_state: "PARTIAL_ACCEPTANCE_PENDING", new_state: "PARTIAL_ACCEPTED", actor_pubkey: data.providerPubkey, actor_role: "PROVIDER", funded_bps: 5_000, transitioned_at: pool.funding_deadline + 86_401 } as PoolTransition;
    expect(validateTransition("PARTIAL_ACCEPTANCE_PENDING", accepted, { pool, providerPubkey: data.providerPubkey, previousTransitionAt: pool.funding_deadline })).toMatchObject({ valid: false, reason: "PARTIAL_ACCEPTANCE_WINDOW_EXPIRED" });
  });

  it("forbids cancellation after disbursement", async () => {
    const data = await fixture(); const pool = JSON.parse(data.pool.content) as PoolCreated;
    const cancellation = { ...(validContentVectors[6]!.content as PoolTransition), previous_state: "DISBURSED", new_state: "CANCELLED", actor_pubkey: data.providerPubkey, actor_role: "PROVIDER" } as PoolTransition;
    expect(validateTransition("DISBURSED", cancellation, { pool, providerPubkey: data.providerPubkey })).toMatchObject({ valid: false });
  });

  it("calculates late penalties with the approved cap", () => {
    expect(calculateLatePenaltyBps(0)).toBe(0);
    expect(calculateLatePenaltyBps(1)).toBe(210);
    expect(calculateLatePenaltyBps(100)).toBe(1_000);
  });
});
