import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { ProtocolSignedEvent } from "@protocol/schemas";
import { validateProtocolEvent } from "@protocol/validators";
import * as schema from "@/db/schema";
import {
  lrpEntityLinks,
  lrpPublicEvents,
  lrpPublicationAttempts,
} from "@/db/schema";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;
export type LrpPrivateEntityType = "RECEIVABLE" | "POOL" | "ORIGINATOR_FACT";

function normalizedRelays(relays: readonly string[]) {
  return [...new Set(relays.map((relay) => new URL(relay).toString()))].sort();
}

function rowMatchesEvent(row: typeof lrpPublicEvents.$inferSelect, event: ProtocolSignedEvent) {
  return row.kind === event.kind && row.pubkey === event.pubkey &&
    row.eventCreatedAt === event.created_at && row.content === event.content &&
    row.signature === event.sig && JSON.stringify(row.tags) === JSON.stringify(event.tags);
}

export async function storeLrpPublicEvent<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { event: ProtocolSignedEvent; observedRelays: readonly string[]; syncedAt: Date },
) {
  const validation = validateProtocolEvent(input.event);
  if (!validation.valid) throw new Error(`LRP_EVENT_INVALID:${validation.reason}`);
  const [existing] = await db.select().from(lrpPublicEvents)
    .where(eq(lrpPublicEvents.eventId, input.event.id)).limit(1);
  if (existing && !rowMatchesEvent(existing, input.event)) throw new Error("LRP_EVENT_ID_CONFLICT");
  const relays = normalizedRelays([
    ...((existing?.observedRelays as string[] | undefined) ?? []),
    ...input.observedRelays,
  ]);
  if (existing) {
    const [updated] = await db.update(lrpPublicEvents).set({
      observedRelays: relays,
      lastSyncedAt: input.syncedAt,
    }).where(eq(lrpPublicEvents.eventId, input.event.id)).returning();
    return { event: updated!, duplicate: true };
  }
  const [created] = await db.insert(lrpPublicEvents).values({
    eventId: input.event.id,
    kind: input.event.kind,
    pubkey: input.event.pubkey,
    eventCreatedAt: input.event.created_at,
    tags: input.event.tags,
    content: input.event.content,
    signature: input.event.sig,
    observedRelays: relays,
    firstSeenAt: input.syncedAt,
    lastSyncedAt: input.syncedAt,
  }).returning();
  return { event: created!, duplicate: false };
}

export async function listLrpPublicEvents<THKT extends PgQueryResultHKT>(db: Database<THKT>) {
  const rows = await db.select().from(lrpPublicEvents);
  return rows.sort((left, right) => left.eventCreatedAt - right.eventCreatedAt || left.eventId.localeCompare(right.eventId));
}

export async function beginLrpPublication<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    idempotencyKey: string;
    entityType: LrpPrivateEntityType;
    privateEntityId: string;
    event: ProtocolSignedEvent;
    now: Date;
  },
) {
  await storeLrpPublicEvent(db, { event: input.event, observedRelays: [], syncedAt: input.now });
  const [created] = await db.insert(lrpPublicationAttempts).values({
    id: randomUUID(),
    idempotencyKey: input.idempotencyKey,
    entityType: input.entityType,
    privateEntityId: input.privateEntityId,
    eventId: input.event.id,
  }).onConflictDoNothing({ target: lrpPublicationAttempts.idempotencyKey }).returning();
  if (created) return { publication: created, duplicate: false };
  const [existing] = await db.select().from(lrpPublicationAttempts)
    .where(eq(lrpPublicationAttempts.idempotencyKey, input.idempotencyKey)).limit(1);
  if (!existing || existing.eventId !== input.event.id || existing.entityType !== input.entityType || existing.privateEntityId !== input.privateEntityId) {
    throw new Error("LRP_PUBLICATION_IDEMPOTENCY_CONFLICT");
  }
  return { publication: existing, duplicate: true };
}

export async function completeLrpPublication<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    idempotencyKey: string;
    status: "CONFIRMED" | "INSUFFICIENT_ACKS" | "REJECTED";
    attemptsAdded: number;
    acknowledgedRelays: readonly string[];
    rejectedRelays: readonly string[];
    timedOutRelays: readonly string[];
    errorCode?: string;
    now: Date;
  },
) {
  const [existing] = await db.select().from(lrpPublicationAttempts)
    .where(eq(lrpPublicationAttempts.idempotencyKey, input.idempotencyKey)).limit(1);
  if (!existing) throw new Error("LRP_PUBLICATION_NOT_FOUND");
  const [updated] = await db.update(lrpPublicationAttempts).set({
    status: input.status,
    attemptCount: sql`${lrpPublicationAttempts.attemptCount} + ${input.attemptsAdded}`,
    acknowledgedRelays: normalizedRelays([...((existing.acknowledgedRelays as string[]) ?? []), ...input.acknowledgedRelays]),
    rejectedRelays: normalizedRelays([...((existing.rejectedRelays as string[]) ?? []), ...input.rejectedRelays]),
    timedOutRelays: normalizedRelays([...((existing.timedOutRelays as string[]) ?? []), ...input.timedOutRelays]),
    lastErrorCode: input.errorCode ?? null,
    updatedAt: input.now,
  }).where(eq(lrpPublicationAttempts.idempotencyKey, input.idempotencyKey)).returning();
  if (!updated) throw new Error("LRP_PUBLICATION_NOT_FOUND");
  return updated;
}

export async function linkLrpEntity<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    entityType: "RECEIVABLE" | "POOL";
    privateEntityId: string;
    eventType: string;
    eventId: string;
    canonicalSource: "LEGACY" | "LRP";
  },
) {
  const [created] = await db.insert(lrpEntityLinks).values({ id: randomUUID(), ...input })
    .onConflictDoNothing({ target: [lrpEntityLinks.entityType, lrpEntityLinks.privateEntityId, lrpEntityLinks.eventType] })
    .returning();
  if (created) return { link: created, duplicate: false };
  const [existing] = await db.select().from(lrpEntityLinks).where(eq(lrpEntityLinks.eventId, input.eventId)).limit(1);
  if (!existing || existing.entityType !== input.entityType || existing.privateEntityId !== input.privateEntityId || existing.eventType !== input.eventType || existing.canonicalSource !== input.canonicalSource) {
    throw new Error("LRP_ENTITY_LINK_CONFLICT");
  }
  return { link: existing, duplicate: true };
}
