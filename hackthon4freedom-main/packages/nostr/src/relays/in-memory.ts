import type { ProtocolSignedEvent } from "../../../protocol/src/schemas";
import type { ProtocolRelayClient, RelayFilter, RelayPublishAck } from "./types";

export class InMemoryRelayClient implements ProtocolRelayClient {
  private readonly events = new Map<string, ProtocolSignedEvent>();
  constructor(
    readonly relayUrl: string,
    private readonly behavior: "ACK" | "REJECT" | "TIMEOUT" = "ACK",
  ) {}

  async publish(event: ProtocolSignedEvent): Promise<RelayPublishAck> {
    if (this.behavior === "TIMEOUT") throw Object.assign(new Error("RELAY_TIMEOUT"), { code: "RELAY_TIMEOUT" });
    if (this.behavior === "REJECT") return { accepted: false, message: "rejected by fake relay" };
    this.events.set(event.id, structuredClone(event));
    return { accepted: true };
  }

  seed(events: readonly ProtocolSignedEvent[]) {
    for (const event of events) this.events.set(event.id, structuredClone(event));
  }

  async query(filter: RelayFilter) {
    if (this.behavior === "TIMEOUT") throw Object.assign(new Error("RELAY_TIMEOUT"), { code: "RELAY_TIMEOUT" });
    if (this.behavior === "REJECT") throw new Error("RELAY_UNAVAILABLE");
    const includesTag = (event: ProtocolSignedEvent, name: string, values?: readonly string[]) => !values || event.tags.some((tag) => tag[0] === name && tag[1] && values.includes(tag[1]));
    return [...this.events.values()].filter((event) =>
      (!filter.kinds || filter.kinds.includes(event.kind)) &&
      (!filter.authors || filter.authors.includes(event.pubkey)) &&
      (!filter.eventIds || filter.eventIds.includes(event.id)) &&
      includesTag(event, "e", filter.referencedEventIds) &&
      includesTag(event, "pool", filter.poolIds) &&
      includesTag(event, "receivable", filter.receivableIds) &&
      includesTag(event, "originator", filter.originatorPubkeys) &&
      (filter.since === undefined || event.created_at >= filter.since) &&
      (filter.until === undefined || event.created_at <= filter.until)
    ).slice(0, filter.limit ?? 500).map((event) => structuredClone(event));
  }
}
