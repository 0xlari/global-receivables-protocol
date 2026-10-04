import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { ProtocolRelayClient } from "@nostr/relays";
import { buildPayerCommitmentProof } from "@protocol/builders";
import { canonicalJson } from "@protocol/canonical-json";
import {
  protocolUnsignedEventSchema,
  type ProtocolSignedEvent,
} from "@protocol/schemas";
import { assertPublicDataSafe } from "@protocol/validators";
import { LRP_EVENT_VERSION } from "@protocol/version";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import * as schema from "@/db/schema";
import {
  clientConfirmations,
  lrpOriginatorEvents,
  lrpReceivableOriginations,
  payerPaymentAuthorizations,
} from "@/db/schema";
import { publishPreparedOriginatorEvent } from "@/services/lrp-originator-event-publication-service";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;
type MigratingMode = Exclude<LrpOriginationMode, "LEGACY">;

function hashPrivateConfirmation(confirmation: typeof clientConfirmations.$inferSelect) {
  return createHash("sha256").update(canonicalJson({
    confirmation_id: confirmation.id,
    receivable_id: confirmation.receivableId,
    receivable_version: confirmation.receivableVersion,
    status: confirmation.status,
    accepts_bitcoin: confirmation.clientAcceptsBtc,
    confirms_description: confirmation.confirmsDescription,
    confirmed_amount_minor: confirmation.confirmedAmount?.toString() ?? null,
    confirmed_due_at: confirmation.confirmedDueAt?.toISOString() ?? null,
    terms_version: confirmation.termsVersion,
    divergences: confirmation.divergences as never,
    used_at: confirmation.usedAt?.toISOString() ?? null,
  })).digest("hex");
}

function candidateFrom(row: typeof lrpOriginatorEvents.$inferSelect) {
  return row.candidateEvent ? protocolUnsignedEventSchema.parse(row.candidateEvent) : undefined;
}

function resultFrom(row: typeof lrpOriginatorEvents.$inferSelect) {
  return {
    originatorEventId: row.id,
    receivableId: row.receivableId,
    eventType: row.eventType,
    mode: row.mode,
    status: row.status,
    candidate: candidateFrom(row),
    publicEventId: row.publicEventId,
    divergences: row.divergences as readonly string[],
  };
}

function shadowReceivableReference(origin: typeof lrpReceivableOriginations.$inferSelect) {
  if (origin.publicEventId) return origin.publicEventId;
  if (!origin.candidateEvent) return undefined;
  return createHash("sha256").update(canonicalJson(origin.candidateEvent as never)).digest("hex");
}

export async function preparePayerCommitmentProof<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { receivableId: string; mode: MigratingMode; originatorPubkey?: string; now: Date },
) {
  const [state] = await db.select({
    confirmation: clientConfirmations,
    origin: lrpReceivableOriginations,
  }).from(clientConfirmations)
    .innerJoin(lrpReceivableOriginations, eq(lrpReceivableOriginations.receivableId, clientConfirmations.receivableId))
    .where(and(
      eq(clientConfirmations.receivableId, input.receivableId),
      eq(clientConfirmations.status, "ACCEPTED"),
    )).limit(1);
  if (!state) throw new Error("LRP_ACCEPTED_CONFIRMATION_NOT_FOUND");
  if (state.origin.mode !== input.mode) throw new Error("LRP_MODE_MISMATCH");
  const [authorization] = await db.select().from(payerPaymentAuthorizations)
    .where(eq(payerPaymentAuthorizations.receivableId, input.receivableId)).limit(1);
  const hasNwcAuthorization = authorization?.method === "NWC_AUTOMATIC" && authorization.status === "ACTIVE" &&
    !authorization.revokedAt && authorization.expiresAt > input.now;

  const privatePayloadHash = hashPrivateConfirmation(state.confirmation);
  const [existing] = await db.select().from(lrpOriginatorEvents).where(and(
    eq(lrpOriginatorEvents.receivableId, input.receivableId),
    eq(lrpOriginatorEvents.eventType, "PayerCommitmentProof"),
  )).limit(1);
  if (existing?.candidateEvent) {
    if (existing.privatePayloadHash !== privatePayloadHash ||
        (input.originatorPubkey && existing.originatorPubkey !== input.originatorPubkey)) {
      throw new Error("LRP_PAYER_COMMITMENT_IDEMPOTENCY_CONFLICT");
    }
    return { ...resultFrom(existing), duplicate: true };
  }

  const receivableEventId = input.mode === "LRP"
    ? state.origin.publicEventId ?? undefined
    : shadowReceivableReference(state.origin);
  const originatorPubkey = input.originatorPubkey ?? (input.mode === "SHADOW" ? "0".repeat(64) : undefined);
  const id = existing?.id ?? randomUUID();
  if (!receivableEventId || !originatorPubkey) {
    const values = {
      id,
      receivableId: input.receivableId,
      eventType: "PayerCommitmentProof",
      mode: input.mode,
      privateRecordId: state.confirmation.id,
      privatePayloadHash,
      divergences: [
        ...(!receivableEventId ? ["RECEIVABLE_EVENT_PENDING"] : []),
        ...(!originatorPubkey ? ["ORIGINATOR_SIGNER_UNAVAILABLE"] : []),
      ],
      updatedAt: input.now,
    };
    const [stored] = existing
      ? await db.update(lrpOriginatorEvents).set(values).where(eq(lrpOriginatorEvents.id, existing.id)).returning()
      : await db.insert(lrpOriginatorEvents).values(values).returning();
    return { ...resultFrom(stored!), duplicate: Boolean(existing) };
  }

  const candidate = buildPayerCommitmentProof({
    protocol_version: LRP_EVENT_VERSION,
    event_type: "PayerCommitmentProof",
    proof_id: id,
    receivable_event_id: receivableEventId,
    private_confirmation_hash: privatePayloadHash,
    confirmed_at: Math.floor(state.confirmation.usedAt!.getTime() / 1000),
    terms_version: state.confirmation.termsVersion!,
    accepts_bitcoin: true,
    has_nwc_authorization: hasNwcAuthorization,
    originator_pubkey: originatorPubkey,
  });
  protocolUnsignedEventSchema.parse(candidate);
  assertPublicDataSafe(JSON.parse(candidate.content));
  const status = input.mode === "SHADOW" ? "SHADOW_VALIDATED" : "CANDIDATE_READY";
  const values = {
    id,
    receivableId: input.receivableId,
    eventType: "PayerCommitmentProof",
    mode: input.mode,
    status,
    originatorPubkey,
    privateRecordId: state.confirmation.id,
    privatePayloadHash,
    candidateEvent: candidate,
    divergences: input.mode === "SHADOW" ? ["LEGACY_CONFIRMATION_REMAINS_CANONICAL"] : [],
    updatedAt: input.now,
  };
  const [stored] = existing
    ? await db.update(lrpOriginatorEvents).set(values).where(eq(lrpOriginatorEvents.id, existing.id)).returning()
    : await db.insert(lrpOriginatorEvents).values(values).returning();
  return { ...resultFrom(stored!), duplicate: Boolean(existing) };
}

export async function publishPayerCommitmentProof<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { originatorEventId: string; originatorPubkey: string; signedEvent?: ProtocolSignedEvent; clients: readonly ProtocolRelayClient[]; now: Date },
) {
  return publishPreparedOriginatorEvent(db, { ...input, eventType: "PayerCommitmentProof" });
}
