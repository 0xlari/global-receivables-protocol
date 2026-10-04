import { databaseFromEnvironment } from "../src/db/client";
import { rebuildLrpProjections } from "../src/services/lrp-public-state-service";
import { lrpRelaysFromEnvironment, NostrToolsRelayClient } from "../packages/nostr/src/relays";

const database = databaseFromEnvironment();
const clients = lrpRelaysFromEnvironment().map((relay) => new NostrToolsRelayClient(relay));

try {
  const report = await rebuildLrpProjections(database.db, clients);
  process.stdout.write(`${JSON.stringify({
    runId: report.run.id,
    status: report.run.status,
    eventCount: report.events.length,
    receivableCount: report.receivables.length,
    poolCount: report.pools.length,
    inconsistencyCount: report.inconsistencies.length,
    unavailableRelayCount: report.unavailableRelays.length,
  }, null, 2)}\n`);
} finally {
  for (const client of clients) client.close();
  await database.close();
}
