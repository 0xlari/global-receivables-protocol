import { describe, expect, it } from "vitest";

import { FakeSigner } from "../signer";
import { InMemoryRelayClient } from "../relays";
import type { ProtocolRelayClient } from "../relays";
import { publishSameEventWithRetry, publishToRelaySet } from "./index";

const signer = new FakeSigner(new Uint8Array(32).fill(9));
const event = await signer.signEvent({ kind: 8100, created_at: 1_800_000_000, tags: [["alt", "protocol"]], content: "{}" });

describe("relay publisher", () => {
  it("confirms after two positive ACKs and tolerates one timeout", async () => {
    const result = await publishToRelaySet(event, [new InMemoryRelayClient("wss://one.example/"), new InMemoryRelayClient("wss://two.example/"), new InMemoryRelayClient("wss://three.example/", "TIMEOUT")]);
    expect(result.status).toBe("CONFIRMED");
    expect(result.acknowledgedRelays).toHaveLength(2);
    expect(result.timedOutRelays).toEqual(["wss://three.example/"]);
  });

  it("does not confirm with only one positive ACK", async () => {
    const result = await publishToRelaySet(event, [new InMemoryRelayClient("wss://one.example/"), new InMemoryRelayClient("wss://two.example/", "REJECT"), new InMemoryRelayClient("wss://three.example/", "TIMEOUT")]);
    expect(result.status).toBe("INSUFFICIENT_ACKS");
    expect(result.acknowledgedRelays).toHaveLength(1);
  });

  it("retries the exact same signed event id until quorum", async () => {
    const receivedIds: string[] = [];
    const relay = (relayUrl: string, acknowledgeAt: number): ProtocolRelayClient => {
      let calls = 0;
      return {
        relayUrl,
        async publish(candidate) {
          calls += 1;
          receivedIds.push(candidate.id);
          return { accepted: calls >= acknowledgeAt };
        },
        async query() { return []; },
      };
    };
    const result = await publishSameEventWithRetry(event, [
      relay("wss://one.example/", 1),
      relay("wss://two.example/", 2),
      relay("wss://three.example/", 99),
    ], { maxAttempts: 3 });
    expect(result.status).toBe("CONFIRMED");
    expect(result.attempts).toHaveLength(2);
    expect(new Set(receivedIds)).toEqual(new Set([event.id]));
  });
});
