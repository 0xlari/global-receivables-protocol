import { describe, expect, it } from "vitest";

import { FakeSigner } from "../signer";
import { InMemoryRelayClient } from "../relays";
import { buildProtocolEvent } from "../../../protocol/src/builders";
import type { ProtocolKind } from "../../../protocol/src/kinds";
import type { ProtocolContent } from "../../../protocol/src/schemas";
import { validContentVectors } from "../../../protocol/src/test-vectors/valid";
import { InMemoryProtocolEventCache } from "./store";
import { rebuildProtocolCache } from "./rebuild";

async function publicGraph() {
  const provider = new FakeSigner(new Uint8Array(32).fill(31)); const originator = new FakeSigner(new Uint8Array(32).fill(32));
  const providerPubkey = await provider.getPublicKey(); const originatorPubkey = await originator.getPublicKey();
  const sign = async (index: number, signer: FakeSigner, overrides: Record<string, unknown> = {}) => {
    const vector = validContentVectors[index]!; const content = { ...vector.content, ...overrides } as ProtocolContent;
    if (content.event_type === "ReceivableCreated") content.provider_pubkey = providerPubkey;
    if (content.event_type === "ClientValidationDecision") content.client_pubkey = originatorPubkey;
    if (content.event_type === "NwcAuthorizationAttestation") content.executor_pubkey = originatorPubkey;
    return signer.signEvent(buildProtocolEvent(vector.kind as ProtocolKind, content));
  };
  const receivable = await sign(1, provider); const commitment = await sign(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey });
  const approval = await sign(3, originator, { receivable_event_id: receivable.id }); const nwc = await sign(4, originator, { receivable_event_id: receivable.id });
  const pool = await sign(5, provider, { receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id, approval_event_id: approval.id, nwc_attestation_event_id: nwc.id, originator_pubkey: originatorPubkey });
  return [receivable, commitment, approval, nwc, pool];
}

describe("rebuildable protocol cache", () => {
  it("clears and reconstructs public state from relays without a database", async () => {
    const events = await publicGraph(); const one = new InMemoryRelayClient("wss://one.example/"); const two = new InMemoryRelayClient("wss://two.example/"); const unavailable = new InMemoryRelayClient("wss://three.example/", "TIMEOUT");
    one.seed(events); two.seed([...events].reverse());
    const cache = new InMemoryProtocolEventCache(); await cache.put(events[0]!, ["wss://stale.example/"], new Date(0));
    const first = await rebuildProtocolCache({ clients: [one, two, unavailable], cache, now: new Date("2026-07-20T12:00:00Z") });
    expect(first.eventCount).toBe(5); expect(first.poolCount).toBe(1); expect(first.pools[0]?.state).toBe("PUBLISHED"); expect(first.unavailableRelays).toEqual(["wss://three.example/"]);
    await cache.clear();
    const second = await rebuildProtocolCache({ clients: [two, one], cache, now: new Date("2026-07-20T12:00:00Z") });
    expect(second.pools).toEqual(first.pools); expect(second.receivables).toEqual(first.receivables);
    expect((await cache.all()).every((record) => record.relays.length === 2)).toBe(true);
  });
});
