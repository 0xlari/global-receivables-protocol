import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { V0_1_IMPLEMENTED_KIND_NAMES, PROTOCOL_KINDS } from "@protocol/kinds";
import { reducePoolState, reduceReceivableState } from "@protocol/reducers";
import type { PoolTransition, ProtocolSignedEvent } from "@protocol/schemas";
import { validateProtocolEvent } from "@protocol/validators";
import { publishSameEventWithRetry } from "@nostr/publisher";
import type { ProtocolRelayClient } from "@nostr/relays";
import { subscribeProtocolEvents } from "@nostr/subscriber";
import { verifyProtocolEventForSubscription } from "@nostr/verification";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import {
  beginLrpPublication,
  completeLrpPublication,
  linkLrpEntity,
  listLrpPublicEvents,
  storeLrpPublicEvent,
  type LrpPrivateEntityType,
} from "@/db/repositories/lrp-event-repository";
import {
  recordLrpProjectionFailure,
  replaceLrpProjections,
} from "@/db/repositories/lrp-projection-repository";
import * as schema from "@/db/schema";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

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

function unique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function progressForPool(
  pool: ReturnType<typeof reducePoolState>["pools"][number],
  events: ReadonlyMap<string, ProtocolSignedEvent>,
) {
  if (pool.latestEventId === pool.poolEventId) return 0;
  const latest = events.get(pool.latestEventId);
  if (!latest) return 0;
  const content = JSON.parse(latest.content) as PoolTransition;
  return content.event_type === "PoolTransition" ? content.funded_bps ?? 0 : 0;
}

export async function synchronizeLrpEventsFromRelays<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  clients: readonly ProtocolRelayClient[],
  now: Date,
) {
  const subscription = await subscribeProtocolEvents(clients, {
    kinds: V0_1_IMPLEMENTED_KIND_NAMES.map((name) => PROTOCOL_KINDS[name]),
    limit: 500,
  }, verifyProtocolEventForSubscription);
  for (const event of subscription.events) {
    await storeLrpPublicEvent(db, {
      event,
      observedRelays: subscription.observedOn[event.id] ?? [],
      syncedAt: now,
    });
  }
  return subscription;
}

export async function rebuildLrpProjections<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  clients: readonly ProtocolRelayClient[],
  now = new Date(),
) {
  const startedAt = now;
  const subscription = await synchronizeLrpEventsFromRelays(db, clients, now);
  const stored = await listLrpPublicEvents(db);
  const admitted = stored.filter((row) => new Set((row.observedRelays as string[]) ?? []).size >= 2);
  const events = admitted.map(eventFromRow);
  const byId = new Map(events.map((event) => [event.id, event]));
  const receivables = reduceReceivableState(events);
  const pools = reducePoolState(events);
  const inconsistencies = [...subscription.rejected, ...receivables.rejected, ...pools.rejected];
  try {
    const run = await replaceLrpProjections(db, {
      receivables: receivables.receivables,
      pools: pools.pools.map((projection) => ({ projection, progressBps: progressForPool(projection, byId) })),
      eventCount: events.length,
      inconsistencies,
      projectedAt: now,
    });
    return { run, events, receivables: receivables.receivables, pools: pools.pools, inconsistencies, unavailableRelays: subscription.unavailableRelays };
  } catch (error) {
    await recordLrpProjectionFailure(db, { eventCount: events.length, inconsistencies, startedAt, finishedAt: new Date() });
    throw error;
  }
}

function assertEntityEventPair(entityType: LrpPrivateEntityType, eventType: string) {
  const valid = entityType === "RECEIVABLE" ? eventType === "ReceivableCreated"
    : entityType === "POOL" ? eventType === "PoolCreated"
      : ["PayerCommitmentProof", "ClientValidationDecision", "NwcAuthorizationAttestation"].includes(eventType);
  if (!valid) throw new Error("LRP_ENTITY_EVENT_TYPE_MISMATCH");
}

export async function publishAndProjectLrpEvent<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    mode: LrpOriginationMode;
    event: ProtocolSignedEvent;
    entityType: LrpPrivateEntityType;
    privateEntityId: string;
    idempotencyKey: string;
    clients: readonly ProtocolRelayClient[];
    maxAttempts?: number;
    now?: Date;
  },
) {
  if (input.mode !== "LRP") throw new Error("LRP_PUBLICATION_DISABLED");
  const verification = validateProtocolEvent(input.event);
  if (!verification.valid) throw new Error(`LRP_EVENT_INVALID:${verification.reason}`);
  assertEntityEventPair(input.entityType, verification.value.content.event_type);
  const now = input.now ?? new Date();
  const prepared = await beginLrpPublication(db, {
    idempotencyKey: input.idempotencyKey,
    entityType: input.entityType,
    privateEntityId: input.privateEntityId,
    event: input.event,
    now,
  });
  if (prepared.publication.status === "CONFIRMED") {
    if (input.entityType === "RECEIVABLE" || input.entityType === "POOL") {
      await linkLrpEntity(db, {
        entityType: input.entityType,
        privateEntityId: input.privateEntityId,
        eventType: verification.value.content.event_type,
        eventId: input.event.id,
        canonicalSource: "LRP",
      });
    }
    const rebuilt = await rebuildLrpProjections(db, input.clients, now);
    return { status: "CONFIRMED" as const, duplicate: true, event: input.event, attempts: [], rebuilt };
  }
  const result = await publishSameEventWithRetry(input.event, input.clients, { maxAttempts: input.maxAttempts ?? 3, requiredAcks: 2 });
  const acknowledgedRelays = unique(result.attempts.flatMap((attempt) => attempt.acknowledgedRelays));
  const rejectedRelays = unique(result.attempts.flatMap((attempt) => attempt.rejectedRelays));
  const timedOutRelays = unique(result.attempts.flatMap((attempt) => attempt.timedOutRelays));
  await completeLrpPublication(db, {
    idempotencyKey: input.idempotencyKey,
    status: result.status,
    attemptsAdded: result.attempts.length,
    acknowledgedRelays,
    rejectedRelays,
    timedOutRelays,
    ...(result.status === "CONFIRMED" ? {} : { errorCode: "LRP_RELAY_QUORUM_INSUFFICIENT" }),
    now,
  });
  await storeLrpPublicEvent(db, { event: input.event, observedRelays: acknowledgedRelays, syncedAt: now });
  if (result.status !== "CONFIRMED") {
    return { status: "INSUFFICIENT_ACKS" as const, duplicate: prepared.duplicate, event: input.event, attempts: result.attempts };
  }
  if (input.entityType === "RECEIVABLE" || input.entityType === "POOL") {
    await linkLrpEntity(db, {
      entityType: input.entityType,
      privateEntityId: input.privateEntityId,
      eventType: verification.value.content.event_type,
      eventId: input.event.id,
      canonicalSource: "LRP",
    });
  }
  const rebuilt = await rebuildLrpProjections(db, input.clients, now);
  return { status: "CONFIRMED" as const, duplicate: prepared.duplicate, event: input.event, attempts: result.attempts, rebuilt };
}
