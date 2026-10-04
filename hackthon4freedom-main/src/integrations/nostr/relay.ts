import { SimplePool, type Event } from "nostr-tools";

export interface NostrRelayGateway {
  publish(relayUrl: string, event: Event): Promise<void>;
  read(relayUrl: string, eventId: string): Promise<Event | null>;
}

export class NostrToolsRelayGateway implements NostrRelayGateway {
  private readonly pool = new SimplePool({ enablePing: true, enableReconnect: false });
  constructor(private readonly timeoutMs = 8_000) {}
  async publish(relayUrl: string, event: Event) {
    const publication = this.pool.publish([relayUrl], event, { maxWait: this.timeoutMs })[0];
    if (!publication) throw new Error("RELAY_PUBLICATION_NOT_STARTED");
    await publication;
  }
  read(relayUrl: string, eventId: string) {
    return this.pool.get([relayUrl], { ids: [eventId], limit: 1 }, { maxWait: this.timeoutMs });
  }
  close() { this.pool.destroy(); }
}

export async function publishToRelays(gateway: NostrRelayGateway, relays: string[], event: Event) {
  const targets = [...new Set(relays)];
  if (targets.length < 2 || targets.some((url) => !url.startsWith("wss://"))) throw new Error("AT_LEAST_TWO_WSS_RELAYS_REQUIRED");
  return Promise.all(targets.map(async (relayUrl) => {
    try {
      await gateway.publish(relayUrl, event);
      const observed = await gateway.read(relayUrl, event.id);
      if (!observed) return { relayUrl, status: "FAILED" as const, errorCode: "READBACK_MISSING" };
      if (observed.id !== event.id || JSON.stringify(observed) !== JSON.stringify(event)) return { relayUrl, status: "FAILED" as const, errorCode: "READBACK_CONFLICT" };
      return { relayUrl, status: "ACKNOWLEDGED" as const, observedEventHash: observed.id };
    } catch {
      return { relayUrl, status: "FAILED" as const, errorCode: "RELAY_UNAVAILABLE" };
    }
  }));
}
