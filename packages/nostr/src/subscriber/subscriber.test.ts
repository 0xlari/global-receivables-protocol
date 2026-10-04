import { describe, expect, it } from "vitest";

import { InMemoryRelayClient } from "../relays";
import { FakeSigner } from "../signer";
import { hasRelayObservationQuorum, subscribeProtocolEvents } from "./index";

const signer = new FakeSigner(new Uint8Array(32).fill(10));
const event = await signer.signEvent({ kind: 8101, created_at: 1_800_000_000, tags: [["receivable", "demo_receivable_01"]], content: "{}" });

describe("protocol subscriber", () => {
  it("deduplicates valid events and records the relays where they were observed", async () => {
    const one = new InMemoryRelayClient("wss://one.example/");
    const two = new InMemoryRelayClient("wss://two.example/");
    one.seed([event]); two.seed([event]);
    const result = await subscribeProtocolEvents([one, two], { kinds: [8101] }, () => ({ valid: true }));
    expect(result.events).toHaveLength(1);
    expect(result.observedOn[event.id]).toEqual(["wss://one.example/", "wss://two.example/"]);
  });

  it("never forwards events rejected by the verifier", async () => {
    const relay = new InMemoryRelayClient("wss://one.example/"); relay.seed([event]);
    const result = await subscribeProtocolEvents([relay], {}, () => ({ valid: false, reason: "INVALID_SCHEMA" }));
    expect(result.events).toEqual([]);
    expect(result.rejected[0]?.reason).toBe("INVALID_SCHEMA");
  });

  it("requires independent relay observations before admitting a public root", async () => {
    const one = { observedOn: { [event.id]: ["wss://one.example/"] } };
    const two = { observedOn: { [event.id]: ["wss://one.example/", "wss://two.example/"] } };
    expect(hasRelayObservationQuorum(one, event.id)).toBe(false);
    expect(hasRelayObservationQuorum(two, event.id)).toBe(true);
  });
});
