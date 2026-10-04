import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import { processMainnetPaymentEvent } from "@/db/repositories/breez-repository";
import type { BreezLiquidGateway, BreezPaymentEvent } from "@/integrations/breez/types";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

export type BreezWorkerFailure = Readonly<{
  externalReference: string;
  eventType: string;
  reason: string;
}>;

export async function runBreezMainnetPollingCycle<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  gateway: BreezLiquidGateway,
) {
  await gateway.sync();
  const payments = await gateway.listPayments();
  const failures: BreezWorkerFailure[] = [];
  let processed = 0;
  for (const event of payments) {
    try {
      await processMainnetPaymentEvent(db, event);
      processed += 1;
    } catch (error) {
      failures.push({
        externalReference: event.externalReference,
        eventType: event.eventType,
        reason: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  return Object.freeze({ processed, failures: Object.freeze(failures) });
}

export async function subscribeBreezMainnetEvents<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  gateway: BreezLiquidGateway,
  onFailure: (failure: BreezWorkerFailure) => void,
) {
  let chain = Promise.resolve();
  const handle = (event: BreezPaymentEvent) => {
    chain = chain
      .then(async () => { await processMainnetPaymentEvent(db, event); })
      .catch((error) => {
        onFailure({
          externalReference: event.externalReference,
          eventType: event.eventType,
          reason: error instanceof Error ? error.name : "UnknownError",
        });
      });
  };
  const unsubscribe = await gateway.subscribe(handle);
  return async () => {
    await chain;
    await unsubscribe();
  };
}
