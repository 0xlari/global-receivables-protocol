import type { ProtocolSignedEvent } from "../../../protocol/src/schemas";
import type { ProtocolRelayClient, RelayFilter } from "../relays";

export type EventVerification = Readonly<{ valid: true }> | Readonly<{ valid: false; reason: string }>;
export type EventVerifier = (event: ProtocolSignedEvent) => EventVerification | Promise<EventVerification>;

export type SubscriptionResult = Readonly<{
  events: readonly ProtocolSignedEvent[];
  observedOn: Readonly<Record<string, readonly string[]>>;
  rejected: readonly Readonly<{ eventId: string; reason: string; relayUrl: string }>[];
  unavailableRelays: readonly string[];
}>;

export function hasRelayObservationQuorum(
  result: Pick<SubscriptionResult, "observedOn">,
  eventId: string,
  requiredAcks = 2,
) {
  if (!Number.isInteger(requiredAcks) || requiredAcks < 1) {
    throw new Error("INVALID_RELAY_OBSERVATION_QUORUM");
  }
  return new Set(result.observedOn[eventId] ?? []).size >= requiredAcks;
}

export async function subscribeProtocolEvents(
  clients: readonly ProtocolRelayClient[],
  filter: RelayFilter,
  verify: EventVerifier,
): Promise<SubscriptionResult> {
  const byId = new Map<string, ProtocolSignedEvent>();
  const observed = new Map<string, Set<string>>();
  const rejected: { eventId: string; reason: string; relayUrl: string }[] = [];
  const unavailableRelays: string[] = [];

  await Promise.all(clients.map(async (client) => {
    try {
      for (const event of await client.query(filter)) {
        const verification = await verify(event);
        if (!verification.valid) {
          rejected.push({ eventId: event.id, reason: verification.reason, relayUrl: client.relayUrl });
          continue;
        }
        const existing = byId.get(event.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
          rejected.push({ eventId: event.id, reason: "EVENT_ID_CONFLICT", relayUrl: client.relayUrl });
          continue;
        }
        byId.set(event.id, event);
        const relays = observed.get(event.id) ?? new Set<string>();
        relays.add(client.relayUrl);
        observed.set(event.id, relays);
      }
    } catch {
      unavailableRelays.push(client.relayUrl);
    }
  }));

  return {
    events: [...byId.values()].sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id)),
    observedOn: Object.fromEntries([...observed].map(([id, relays]) => [id, [...relays].sort()])),
    rejected: rejected.sort((left, right) => left.eventId.localeCompare(right.eventId) || left.relayUrl.localeCompare(right.relayUrl)),
    unavailableRelays: unavailableRelays.sort(),
  };
}
