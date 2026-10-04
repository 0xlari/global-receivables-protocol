import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { ProtocolRelayClient } from "@nostr/relays";
import {
  protocolSignedEventSchema,
  protocolUnsignedEventSchema,
  type ProtocolSignedEvent,
} from "@protocol/schemas";
import { validateProtocolEvent } from "@protocol/validators";
import * as schema from "@/db/schema";
import { lrpOriginatorEvents, lrpPublicationAttempts } from "@/db/schema";
import { publishAndProjectLrpEvent } from "@/services/lrp-public-state-service";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;
export type OriginatorEventType = "PayerCommitmentProof" | "ClientValidationDecision" | "NwcAuthorizationAttestation";

function resultFrom(row: typeof lrpOriginatorEvents.$inferSelect) {
  return {
    originatorEventId: row.id,
    receivableId: row.receivableId,
    eventType: row.eventType,
    mode: row.mode,
    status: row.status,
    candidate: row.candidateEvent ? protocolUnsignedEventSchema.parse(row.candidateEvent) : undefined,
    publicEventId: row.publicEventId,
    divergences: row.divergences as readonly string[],
  };
}

export async function publishPreparedOriginatorEvent<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    originatorEventId: string;
    eventType: OriginatorEventType;
    originatorPubkey: string;
    signedEvent?: ProtocolSignedEvent;
    clients: readonly ProtocolRelayClient[];
    now: Date;
  },
) {
  const [row] = await db.select().from(lrpOriginatorEvents).where(eq(lrpOriginatorEvents.id, input.originatorEventId)).limit(1);
  if (!row || row.mode !== "LRP" || row.eventType !== input.eventType || !row.candidateEvent || row.originatorPubkey !== input.originatorPubkey) {
    throw new Error("LRP_ORIGINATOR_EVENT_NOT_READY");
  }
  const candidate = protocolUnsignedEventSchema.parse(row.candidateEvent);
  const signed = input.signedEvent
    ? protocolSignedEventSchema.parse(input.signedEvent)
    : row.signedEvent ? protocolSignedEventSchema.parse(row.signedEvent) : undefined;
  if (!signed) throw new Error("LRP_SIGNED_EVENT_REQUIRED");
  if (signed.pubkey !== input.originatorPubkey || signed.kind !== candidate.kind || signed.created_at !== candidate.created_at ||
      signed.content !== candidate.content || JSON.stringify(signed.tags) !== JSON.stringify(candidate.tags)) {
    throw new Error("LRP_SIGNED_EVENT_DOES_NOT_MATCH_CANDIDATE");
  }
  const validation = validateProtocolEvent(signed);
  if (!validation.valid || validation.value.content.event_type !== input.eventType) {
    throw new Error(`LRP_ORIGINATOR_EVENT_INVALID:${validation.valid ? "WRONG_TYPE" : validation.reason}`);
  }
  if (row.signedEvent && JSON.stringify(protocolSignedEventSchema.parse(row.signedEvent)) !== JSON.stringify(signed)) {
    throw new Error("LRP_SIGNED_EVENT_RETRY_CONFLICT");
  }
  await db.update(lrpOriginatorEvents).set({ signedEvent: signed, updatedAt: input.now }).where(eq(lrpOriginatorEvents.id, row.id));
  const idempotencyKey = `receivable:${row.receivableId}:${input.eventType}`;
  try {
    const publication = await publishAndProjectLrpEvent(db, {
      mode: "LRP", event: signed, entityType: "ORIGINATOR_FACT", privateEntityId: row.privateRecordId,
      idempotencyKey, clients: input.clients, now: input.now,
    });
    const [updated] = await db.update(lrpOriginatorEvents).set({
      status: publication.status === "CONFIRMED" ? "PUBLISHED" : "PUBLICATION_PENDING",
      publicEventId: signed.id,
      canonicalSource: publication.status === "CONFIRMED" ? "LRP" : "LEGACY",
      updatedAt: input.now,
    }).where(eq(lrpOriginatorEvents.id, row.id)).returning();
    return { ...resultFrom(updated!), publicationStatus: publication.status, event: signed };
  } catch (error) {
    const [attempt] = await db.select().from(lrpPublicationAttempts).where(eq(lrpPublicationAttempts.idempotencyKey, idempotencyKey)).limit(1);
    if (attempt?.status === "CONFIRMED") {
      const [updated] = await db.update(lrpOriginatorEvents).set({
        status: "PROJECTION_PENDING", publicEventId: signed.id, canonicalSource: "LRP", updatedAt: input.now,
      }).where(eq(lrpOriginatorEvents.id, row.id)).returning();
      return { ...resultFrom(updated!), publicationStatus: "CONFIRMED" as const, projectionPending: true, event: signed };
    }
    throw error;
  }
}
