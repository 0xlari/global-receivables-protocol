import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { ProtocolRelayClient } from "@nostr/relays";
import { buildNwcAuthorizationAttestation } from "@protocol/builders";
import { canonicalJson } from "@protocol/canonical-json";
import { protocolUnsignedEventSchema, type ProtocolSignedEvent } from "@protocol/schemas";
import { assertPublicDataSafe } from "@protocol/validators";
import { LRP_EVENT_VERSION } from "@protocol/version";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import * as schema from "@/db/schema";
import {
  lrpOriginatorEvents,
  lrpReceivableOriginations,
  nwcConnections,
  payerPaymentAuthorizations,
} from "@/db/schema";
import { publicNwcFingerprint } from "@/integrations/nwc/public-fingerprint";
import { publishPreparedOriginatorEvent } from "@/services/lrp-originator-event-publication-service";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;
type MigratingMode = Exclude<LrpOriginationMode, "LEGACY">;

function publicResult(row: typeof lrpOriginatorEvents.$inferSelect) {
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

export async function prepareNwcAuthorizationAttestation<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { receivableId: string; mode: MigratingMode; originatorPubkey?: string; now: Date },
) {
  const [state] = await db.select({ authorization: payerPaymentAuthorizations, connection: nwcConnections, origin: lrpReceivableOriginations })
    .from(payerPaymentAuthorizations)
    .innerJoin(nwcConnections, eq(nwcConnections.authorizationId, payerPaymentAuthorizations.id))
    .innerJoin(lrpReceivableOriginations, eq(lrpReceivableOriginations.receivableId, payerPaymentAuthorizations.receivableId))
    .where(eq(payerPaymentAuthorizations.receivableId, input.receivableId)).limit(1);
  if (!state) throw new Error("LRP_NWC_PRIVATE_AUTHORIZATION_NOT_FOUND");
  const methods = state.connection.supportedMethods as string[];
  if (state.authorization.method !== "NWC_AUTOMATIC" || state.authorization.status !== "ACTIVE" ||
      state.connection.status !== "ACTIVE" || state.authorization.revokedAt || state.connection.revokedAt ||
      state.authorization.expiresAt <= input.now || !methods.includes("pay_invoice")) {
    throw new Error("LRP_NWC_ACTIVE_ATTESTATION_BLOCKED");
  }
  const privatePayloadHash = createHash("sha256").update(canonicalJson({
    authorization_id: state.authorization.id,
    connection_id: state.connection.id,
    receivable_id: state.authorization.receivableId,
    authorization_status: state.authorization.status,
    connection_status: state.connection.status,
    max_amount_msat: state.authorization.maxAmountMsat.toString(),
    max_fee_msat: state.authorization.maxFeeMsat.toString(),
    scheduled_for: state.authorization.scheduledFor.toISOString(),
    expires_at: state.authorization.expiresAt.toISOString(),
    single_use: state.authorization.singleUse,
    connection_fingerprint: state.connection.connectionFingerprint,
    supported_methods: methods as never,
    last_checked_at: state.connection.lastCheckedAt.toISOString(),
  })).digest("hex");
  const [existing] = await db.select().from(lrpOriginatorEvents).where(and(
    eq(lrpOriginatorEvents.receivableId, input.receivableId),
    eq(lrpOriginatorEvents.eventType, "NwcAuthorizationAttestation"),
  )).limit(1);
  if (existing?.candidateEvent) {
    if (existing.privatePayloadHash !== privatePayloadHash || (input.originatorPubkey && existing.originatorPubkey !== input.originatorPubkey)) {
      throw new Error("LRP_NWC_ATTESTATION_IDEMPOTENCY_CONFLICT");
    }
    return { ...publicResult(existing), duplicate: true };
  }
  const commitment = await db.select().from(lrpOriginatorEvents).where(and(
    eq(lrpOriginatorEvents.receivableId, input.receivableId),
    eq(lrpOriginatorEvents.eventType, "PayerCommitmentProof"),
  )).limit(1);
  const receivableEventId = input.mode === "LRP"
    ? state.origin.publicEventId
    : commitment[0]?.candidateEvent
      ? (JSON.parse(protocolUnsignedEventSchema.parse(commitment[0].candidateEvent).content) as { receivable_event_id: string }).receivable_event_id
      : undefined;
  const id = existing?.id ?? randomUUID();
  const originatorPubkey = input.originatorPubkey ?? (input.mode === "SHADOW" ? "0".repeat(64) : undefined);
  if (!receivableEventId || !originatorPubkey) {
    const values = {
      id, receivableId: input.receivableId, eventType: "NwcAuthorizationAttestation", mode: input.mode,
      privateRecordId: state.authorization.id, privatePayloadHash,
      divergences: [...(!receivableEventId ? ["RECEIVABLE_EVENT_PENDING"] : []), ...(!originatorPubkey ? ["ORIGINATOR_SIGNER_UNAVAILABLE"] : [])],
      updatedAt: input.now,
    };
    const [stored] = existing
      ? await db.update(lrpOriginatorEvents).set(values).where(eq(lrpOriginatorEvents.id, existing.id)).returning()
      : await db.insert(lrpOriginatorEvents).values(values).returning();
    return { ...publicResult(stored!), duplicate: Boolean(existing) };
  }
  const candidate = buildNwcAuthorizationAttestation({
    protocol_version: LRP_EVENT_VERSION,
    event_type: "NwcAuthorizationAttestation",
    attestation_id: id,
    receivable_event_id: receivableEventId,
    authorization_state: "ACTIVE",
    pay_invoice_supported: true,
    max_authorized_msat: state.authorization.maxAmountMsat.toString(),
    due_at: Math.floor(state.authorization.scheduledFor.getTime() / 1000),
    expires_at: Math.floor(state.authorization.expiresAt.getTime() / 1000),
    single_use: true,
    safe_fingerprint: publicNwcFingerprint(state.connection.connectionFingerprint),
    last_validated_at: Math.floor(state.connection.lastCheckedAt.getTime() / 1000),
    executor_pubkey: originatorPubkey,
  });
  protocolUnsignedEventSchema.parse(candidate);
  assertPublicDataSafe(JSON.parse(candidate.content));
  const values = {
    id, receivableId: input.receivableId, eventType: "NwcAuthorizationAttestation", mode: input.mode,
    status: input.mode === "SHADOW" ? "SHADOW_VALIDATED" : "CANDIDATE_READY",
    originatorPubkey, privateRecordId: state.authorization.id, privatePayloadHash, candidateEvent: candidate,
    divergences: input.mode === "SHADOW" ? ["LEGACY_NWC_AUTHORIZATION_REMAINS_CANONICAL"] : [], updatedAt: input.now,
  };
  const [stored] = existing
    ? await db.update(lrpOriginatorEvents).set(values).where(eq(lrpOriginatorEvents.id, existing.id)).returning()
    : await db.insert(lrpOriginatorEvents).values(values).returning();
  return { ...publicResult(stored!), duplicate: Boolean(existing) };
}

export async function publishNwcAuthorizationAttestation<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { originatorEventId: string; originatorPubkey: string; signedEvent?: ProtocolSignedEvent; clients: readonly ProtocolRelayClient[]; now: Date },
) {
  return publishPreparedOriginatorEvent(db, { ...input, eventType: "NwcAuthorizationAttestation" });
}
