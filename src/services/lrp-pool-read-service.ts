import { desc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { canonicalJson, type JsonValue } from "@protocol/canonical-json";
import type { PoolProjection } from "@protocol/reducers";
import type { PoolState, ProtocolSignedEvent } from "@protocol/schemas";
import { validateProtocolEvent } from "@protocol/validators";
import * as schema from "@/db/schema";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

export const LRP_PROJECTION_STALE_AFTER_MS = 15 * 60 * 1_000;

export type LrpPoolReadIssue =
  | "PROJECTION_NOT_FOUND"
  | "PROJECTION_STALE"
  | "CANONICAL_EVENT_MISSING"
  | "RELAY_QUORUM_INSUFFICIENT"
  | "INVALID_EVENT_GRAPH"
  | "REDUCER_CONFLICT"
  | "DATABASE_UNAVAILABLE"
  | "REBUILD_IN_PROGRESS";

export type LrpPoolPublicView = Readonly<{
  source: "LRP";
  poolId: string;
  eventId: string;
  title: string;
  providerPseudonym: string;
  publicReputation: readonly string[];
  targetSats: string;
  originalCurrency: string;
  dueAt: number;
  discountBps: number;
  expectedReturnBps: number;
  minimumPartialBps: number;
  fundingDeadline: number;
  fixedLateFeeBps: number;
  dailyLateInterestBps: number;
  maximumPenaltyBps: number;
  originatorPubkey: string;
  state: PoolState;
  progressBps: number;
  relayConfirmations: number;
  verified: boolean;
  projectedAt: string;
  issues: readonly LrpPoolReadIssue[];
}>;

export type LrpPoolReadResult = Readonly<{
  status: "READY" | "DEGRADED" | "REBUILDING" | "UNAVAILABLE";
  pools: readonly LrpPoolPublicView[];
  issues: readonly LrpPoolReadIssue[];
}>;

function eventFromRow(row: typeof schema.lrpPublicEvents.$inferSelect): ProtocolSignedEvent {
  return {
    id: row.eventId,
    kind: row.kind,
    pubkey: row.pubkey,
    created_at: row.eventCreatedAt,
    tags: row.tags as string[][],
    content: row.content,
    sig: row.signature,
  };
}

function hasConflict(inconsistencies: unknown, eventIds: readonly string[]) {
  if (!Array.isArray(inconsistencies)) return false;
  return inconsistencies.some((item) => {
    if (!item || typeof item !== "object") return false;
    const eventId = "eventId" in item ? (item as { eventId?: unknown }).eventId : undefined;
    return typeof eventId === "string" && eventIds.includes(eventId);
  });
}

export function evaluateLrpPoolProjection(input: {
  projection: typeof schema.lrpPoolProjections.$inferSelect;
  event?: typeof schema.lrpPublicEvents.$inferSelect;
  runInconsistencies?: unknown;
  now: Date;
  staleAfterMs?: number;
}): LrpPoolPublicView {
  const projected = input.projection.projection as PoolProjection;
  const issues: LrpPoolReadIssue[] = [];
  const relayConfirmations = new Set((input.event?.observedRelays as string[] | undefined) ?? []).size;
  let verified = false;

  if (!input.event) {
    issues.push("CANONICAL_EVENT_MISSING");
  } else {
    const validation = validateProtocolEvent(eventFromRow(input.event));
    const sameProjection = validation.valid && validation.value.content.event_type === "PoolCreated" &&
      canonicalJson(validation.value.content as unknown as JsonValue) === canonicalJson(projected.terms as unknown as JsonValue) &&
      input.event.eventId === projected.poolEventId && input.event.pubkey === projected.providerPubkey;
    if (!sameProjection) issues.push("INVALID_EVENT_GRAPH");
    if (relayConfirmations < 2) issues.push("RELAY_QUORUM_INSUFFICIENT");
    verified = sameProjection && relayConfirmations >= 2;
  }

  if (input.now.getTime() - input.projection.projectedAt.getTime() > (input.staleAfterMs ?? LRP_PROJECTION_STALE_AFTER_MS)) {
    issues.push("PROJECTION_STALE");
  }
  if (hasConflict(input.runInconsistencies, [input.projection.poolEventId, input.projection.latestEventId])) {
    issues.push("REDUCER_CONFLICT");
  }

  const terms = projected.terms;
  return {
    source: "LRP",
    poolId: projected.poolId,
    eventId: projected.poolEventId,
    title: terms.title,
    providerPseudonym: terms.provider_pseudonym,
    publicReputation: terms.public_reputation_facts.map((fact) => fact.assertion),
    targetSats: terms.target_sats,
    originalCurrency: terms.original_currency,
    dueAt: terms.due_at,
    discountBps: terms.discount_bps,
    expectedReturnBps: terms.expected_return_bps,
    minimumPartialBps: terms.minimum_partial_bps,
    fundingDeadline: terms.funding_deadline,
    fixedLateFeeBps: terms.fixed_late_fee_bps,
    dailyLateInterestBps: terms.daily_late_interest_bps,
    maximumPenaltyBps: terms.maximum_penalty_bps,
    originatorPubkey: terms.originator_pubkey,
    state: projected.state,
    progressBps: input.projection.progressBps,
    relayConfirmations,
    verified,
    projectedAt: input.projection.projectedAt.toISOString(),
    issues,
  };
}

export async function readLrpPoolProjections<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { poolId?: string; canonicalOnly?: boolean; now?: Date; staleAfterMs?: number } = {},
): Promise<LrpPoolReadResult> {
  try {
    const now = input.now ?? new Date();
    const [run] = await db.select().from(schema.lrpProjectionRuns)
      .orderBy(desc(schema.lrpProjectionRuns.startedAt)).limit(1);
    let projections = input.poolId
      ? await db.select().from(schema.lrpPoolProjections).where(eq(schema.lrpPoolProjections.poolId, input.poolId))
      : await db.select().from(schema.lrpPoolProjections);
    if (input.canonicalOnly) {
      const origins = await db.select({ poolId: schema.lrpPoolOriginations.poolId })
        .from(schema.lrpPoolOriginations).where(eq(schema.lrpPoolOriginations.canonicalSource, "LRP"));
      const canonicalIds = new Set(origins.map((origin) => origin.poolId));
      projections = projections.filter((projection) => canonicalIds.has(projection.poolId));
    }

    if (input.poolId && projections.length === 0) {
      return { status: "DEGRADED", pools: [], issues: ["PROJECTION_NOT_FOUND"] };
    }
    const eventIds = projections.map((projection) => projection.poolEventId);
    const events = eventIds.length
      ? await db.select().from(schema.lrpPublicEvents).where(inArray(schema.lrpPublicEvents.eventId, eventIds))
      : [];
    const eventById = new Map(events.map((event) => [event.eventId, event]));
    const evaluated: LrpPoolPublicView[] = [];
    const evaluationIssues: LrpPoolReadIssue[] = [];
    for (const projection of projections) {
      try {
        const pool = evaluateLrpPoolProjection({
          projection,
          event: eventById.get(projection.poolEventId),
          runInconsistencies: run?.inconsistencies,
          now,
          staleAfterMs: input.staleAfterMs,
        });
        evaluated.push(pool);
        evaluationIssues.push(...pool.issues);
      } catch {
        evaluationIssues.push("INVALID_EVENT_GRAPH");
      }
    }
    // Conteúdo sem assinatura válida, sem quórum ou rejeitado pelo reducer
    // nunca é aceito como pool. Stale continua visível, mas explicitamente marcado.
    const pools = evaluated.filter((pool) => pool.verified && !pool.issues.includes("REDUCER_CONFLICT"));
    const issues = [...new Set(evaluationIssues)];
    if (run?.status === "RUNNING") issues.unshift("REBUILD_IN_PROGRESS");
    return {
      status: run?.status === "RUNNING" ? "REBUILDING" : issues.length ? "DEGRADED" : "READY",
      pools,
      issues,
    };
  } catch {
    return { status: "UNAVAILABLE", pools: [], issues: ["DATABASE_UNAVAILABLE"] };
  }
}
