import { randomUUID } from "node:crypto";

import { createDatabase } from "@/db/client";
import { reconcileMainnetWallet } from "@/db/repositories/breez-repository";
import { connectBreezMainnet } from "@/integrations/breez/sdk-gateway";
import { loadBreezMainnetConfig } from "@/integrations/breez/config";

import {
  runBreezMainnetPollingCycle,
  subscribeBreezMainnetEvents,
  type BreezWorkerFailure,
} from "./breez-mainnet-worker";

export async function startBreezMainnetRuntime(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const config = loadBreezMainnetConfig(environment);
  const gateway = await connectBreezMainnet(config);
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const database = createDatabase(environment.DATABASE_URL);
  const failures: BreezWorkerFailure[] = [];
  let stopped = false;

  const unsubscribe = await subscribeBreezMainnetEvents(
    database.db,
    gateway,
    (failure) => failures.push(failure),
  );

  const runOnce = async () => {
    if (stopped) return { processed: 0, failures: [] as readonly BreezWorkerFailure[] };
    const polling = await runBreezMainnetPollingCycle(database.db, gateway);
    failures.push(...polling.failures);
    await reconcileMainnetWallet(database.db, gateway, {
      runId: randomUUID(),
      idempotencyKey: `breez-mainnet-reconcile:${new Date().toISOString()}`,
      usdtAssetId: config.usdtAssetId,
      now: new Date(),
    });
    return polling;
  };

  return Object.freeze({
    runOnce,
    failures: () => Object.freeze([...failures]),
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await unsubscribe();
      await gateway.disconnect();
      await database.close();
    },
  });
}
