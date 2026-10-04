import { SimplePool, type Filter } from "nostr-tools";

import type { ProtocolSignedEvent } from "../../../protocol/src/schemas";
import type { ProtocolRelayClient, RelayFilter } from "./types";

function toNostrFilter(filter: RelayFilter): Filter {
  return {
    ...(filter.kinds ? { kinds: [...filter.kinds] } : {}),
    ...(filter.authors ? { authors: [...filter.authors] } : {}),
    ...(filter.eventIds ? { ids: [...filter.eventIds] } : {}),
    ...(filter.referencedEventIds ? { "#e": [...filter.referencedEventIds] } : {}),
    ...(filter.poolIds ? { "#pool": [...filter.poolIds] } : {}),
    ...(filter.receivableIds ? { "#receivable": [...filter.receivableIds] } : {}),
    ...(filter.originatorPubkeys ? { "#originator": [...filter.originatorPubkeys] } : {}),
    ...(filter.since !== undefined ? { since: filter.since } : {}),
    ...(filter.until !== undefined ? { until: filter.until } : {}),
    limit: filter.limit ?? 500,
  } as Filter;
}

export class NostrToolsRelayClient implements ProtocolRelayClient {
  private readonly pool = new SimplePool({ enablePing: true, enableReconnect: false });
  readonly relayUrl: string;

  constructor(relayUrl: string, private readonly timeoutMs = 8_000) {
    this.relayUrl = new URL(relayUrl).toString();
  }

  async publish(event: ProtocolSignedEvent) {
    const publication = this.pool.publish([this.relayUrl], event, { maxWait: this.timeoutMs })[0];
    if (!publication) return { accepted: false, message: "PUBLICATION_NOT_STARTED" };
    try {
      await publication;
      return { accepted: true };
    } catch (error) {
      return { accepted: false, message: error instanceof Error ? error.message.slice(0, 160) : "RELAY_REJECTED" };
    }
  }

  async query(filter: RelayFilter) {
    const events = await this.pool.querySync([this.relayUrl], toNostrFilter(filter), { maxWait: this.timeoutMs });
    return events as ProtocolSignedEvent[];
  }

  close() {
    this.pool.close([this.relayUrl]);
  }
}
