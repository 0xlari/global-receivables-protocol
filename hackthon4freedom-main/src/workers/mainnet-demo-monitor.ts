import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { triggerMainnetCircuitBreaker } from "@/db/repositories/mainnet-demo-repository";
import * as schema from "@/db/schema";
import { mainnetDemoRuns, reconciliationRuns } from "@/db/schema";
import { MAINNET_MAX_HOT_WALLET_SATS } from "@/integrations/breez/config";
import type { BreezLiquidGateway } from "@/integrations/breez/types";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

export async function monitorActiveMainnetDemo<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  gateway: BreezLiquidGateway,
  demoRunId: string,
  now = new Date(),
) {
  const [run] = await db.select({ status: mainnetDemoRuns.status }).from(mainnetDemoRuns).where(eq(mainnetDemoRuns.id, demoRunId)).limit(1);
  if (!run || run.status !== "ACTIVE") return { status: "INACTIVE" as const };

  const snapshot = await gateway.getAuditSnapshot();
  let reason: string | undefined;
  if (snapshot.btcSats > MAINNET_MAX_HOT_WALLET_SATS) reason = "HOT_WALLET_LIMIT_EXCEEDED";
  else if (snapshot.refundableCount > 0) reason = "REFUNDABLE_SWAP_DETECTED";
  else if (snapshot.unknownPaymentCount > 0) reason = "UNKNOWN_PAYMENT_DETECTED";

  const [latestReconciliation] = await db.select({ id: reconciliationRuns.id, status: reconciliationRuns.status })
    .from(reconciliationRuns)
    .where(eq(reconciliationRuns.environment, "MAINNET"))
    .orderBy(desc(reconciliationRuns.completedAt))
    .limit(1);
  if (!reason && latestReconciliation && latestReconciliation.status !== "MATCHED") reason = "RECONCILIATION_DIVERGED";

  if (!reason) return { status: "HEALTHY" as const, snapshotHash: snapshot.snapshotHash };
  const observation = latestReconciliation?.id ?? snapshot.snapshotHash;
  await triggerMainnetCircuitBreaker(db, {
    id: randomUUID(), demoRunId, idempotencyKey: `demo-monitor:${demoRunId}:${reason}:${observation}`,
    reason, details: `${snapshot.snapshotHash}|${observation}`, now,
  });
  return { status: "ABORTED" as const, reason };
}
