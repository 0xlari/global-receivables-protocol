import { reducePoolState, reduceReceivableState } from "../../../protocol/src/reducers";
import type { ProtocolRelayClient, RelayFilter } from "../relays";
import { subscribeProtocolEvents } from "../subscriber";
import { verifyProtocolEventForSubscription } from "../verification";
import { cachedRecordToEvent, type ProtocolEventCache } from "./store";

export async function rebuildProtocolCache(input: {
  clients: readonly ProtocolRelayClient[];
  cache: ProtocolEventCache;
  filter?: RelayFilter;
  now?: Date;
}) {
  await input.cache.clear();
  const synchronizedAt = input.now ?? new Date();
  const subscription = await subscribeProtocolEvents(input.clients, input.filter ?? {}, verifyProtocolEventForSubscription);
  for (const event of subscription.events) await input.cache.put(event, subscription.observedOn[event.id] ?? [], synchronizedAt);
  const records = await input.cache.all();
  const events = records.map(cachedRecordToEvent);
  const receivables = reduceReceivableState(events);
  const pools = reducePoolState(events);
  return {
    synchronizedAt: synchronizedAt.toISOString(),
    eventCount: records.length,
    receivableCount: receivables.receivables.length,
    poolCount: pools.pools.length,
    unavailableRelays: subscription.unavailableRelays,
    relayRejections: subscription.rejected,
    inconsistencies: [...receivables.rejected, ...pools.rejected],
    receivables: receivables.receivables,
    pools: pools.pools,
  };
}
