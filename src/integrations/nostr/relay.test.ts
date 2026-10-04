// @vitest-environment node
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { publishToRelays, type NostrRelayGateway } from "./relay";

const event = finalizeEvent({ kind: 30078, created_at: 1, tags: [], content: "{}" }, generateSecretKey());
describe("Nostr relay fan-out", () => {
  it("acknowledges independent publication and readback in two relays", async () => {
    const gateway: NostrRelayGateway = { publish: async () => undefined, read: async () => event };
    const result = await publishToRelays(gateway, ["wss://one.example", "wss://two.example"], event);
    expect(result.map((item) => item.status)).toEqual(["ACKNOWLEDGED", "ACKNOWLEDGED"]);
  });
  it("records an offline relay without throwing or blocking the other", async () => {
    const gateway: NostrRelayGateway = { publish: async (url) => { if (url.includes("off")) throw new Error("offline"); }, read: async () => event };
    const result = await publishToRelays(gateway, ["wss://ok.example", "wss://off.example"], event);
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ relayUrl: "wss://ok.example", status: "ACKNOWLEDGED" }), expect.objectContaining({ relayUrl: "wss://off.example", status: "FAILED", errorCode: "RELAY_UNAVAILABLE" })]));
  });
  it("detects conflicting readback", async () => {
    const other = finalizeEvent({ kind: 30078, created_at: 2, tags: [], content: "{}" }, generateSecretKey());
    const gateway: NostrRelayGateway = { publish: async () => undefined, read: async () => other };
    const result = await publishToRelays(gateway, ["wss://one.example", "wss://two.example"], event);
    expect(result.every((item) => item.status === "FAILED" && item.errorCode === "READBACK_CONFLICT")).toBe(true);
  });
  it("requires two distinct secure relays", async () => {
    const gateway: NostrRelayGateway = { publish: async () => undefined, read: async () => event };
    await expect(publishToRelays(gateway, ["wss://one.example", "wss://one.example"], event)).rejects.toThrow("TWO_WSS_RELAYS");
  });
});
