import { resolve } from "node:path";

import { V0_1_IMPLEMENTED_KIND_NAMES, PROTOCOL_KINDS } from "../packages/protocol/src/kinds";
import { FileProtocolEventCache, rebuildProtocolCache } from "../packages/nostr/src/event-cache";
import { lrpRelaysFromEnvironment, NostrToolsRelayClient } from "../packages/nostr/src/relays";

const relays = lrpRelaysFromEnvironment();
const clients = relays.map((relay) => new NostrToolsRelayClient(relay));
const cachePath = resolve(process.env.LRP_CACHE_FILE ?? ".next/cache/nostr-lrp-events.json");

try {
  const report = await rebuildProtocolCache({
    clients,
    cache: new FileProtocolEventCache(cachePath),
    filter: { kinds: V0_1_IMPLEMENTED_KIND_NAMES.map((name) => PROTOCOL_KINDS[name]) },
  });
  process.stdout.write(`${JSON.stringify({ cachePath, eventCount: report.eventCount, receivableCount: report.receivableCount, poolCount: report.poolCount, unavailableRelayCount: report.unavailableRelays.length, inconsistencyCount: report.inconsistencies.length }, null, 2)}\n`);
  if (report.unavailableRelays.length > relays.length - 2) process.exitCode = 2;
} finally {
  for (const client of clients) client.close?.();
}
