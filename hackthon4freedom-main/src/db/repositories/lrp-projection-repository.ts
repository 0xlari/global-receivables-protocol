import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { PoolProjection, ReceivableProjection } from "@protocol/reducers";
import * as schema from "@/db/schema";
import {
  lrpPoolProjections,
  lrpProjectionRuns,
  lrpReceivableProjections,
} from "@/db/schema";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

export async function replaceLrpProjections<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    receivables: readonly ReceivableProjection[];
    pools: readonly Readonly<{ projection: PoolProjection; progressBps: number }>[];
    eventCount: number;
    inconsistencies: readonly unknown[];
    projectedAt: Date;
  },
) {
  return db.transaction(async (tx) => {
    const runId = randomUUID();
    await tx.insert(lrpProjectionRuns).values({ id: runId, status: "RUNNING", startedAt: input.projectedAt });
    await tx.delete(lrpPoolProjections);
    await tx.delete(lrpReceivableProjections);
    if (input.receivables.length) await tx.insert(lrpReceivableProjections).values(input.receivables.map((projection) => ({
      receivableEventId: projection.receivableEventId,
      receivableId: projection.receivableId,
      providerPubkey: projection.providerPubkey,
      projection,
      projectedAt: input.projectedAt,
    })));
    if (input.pools.length) await tx.insert(lrpPoolProjections).values(input.pools.map(({ projection, progressBps }) => ({
      poolEventId: projection.poolEventId,
      poolId: projection.poolId,
      providerPubkey: projection.providerPubkey,
      originatorPubkey: projection.originatorPubkey,
      state: projection.state,
      latestEventId: projection.latestEventId,
      progressBps,
      projection,
      projectedAt: input.projectedAt,
    })));
    const [completed] = await tx.update(lrpProjectionRuns).set({
      status: "COMPLETED",
      eventCount: input.eventCount,
      receivableCount: input.receivables.length,
      poolCount: input.pools.length,
      inconsistencies: input.inconsistencies,
      finishedAt: input.projectedAt,
    }).where(eq(lrpProjectionRuns.id, runId)).returning();
    return completed!;
  });
}

export async function clearLrpProjections<THKT extends PgQueryResultHKT>(db: Database<THKT>) {
  await db.transaction(async (tx) => {
    await tx.delete(lrpPoolProjections);
    await tx.delete(lrpReceivableProjections);
  });
}

export async function recordLrpProjectionFailure<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { eventCount: number; inconsistencies: readonly unknown[]; startedAt: Date; finishedAt: Date },
) {
  const [failed] = await db.insert(lrpProjectionRuns).values({
    id: randomUUID(),
    status: "FAILED",
    eventCount: input.eventCount,
    inconsistencies: input.inconsistencies,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  }).returning();
  return failed!;
}
