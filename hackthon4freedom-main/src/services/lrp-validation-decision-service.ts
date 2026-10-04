import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { ProtocolRelayClient } from "@nostr/relays";
import { buildClientValidationDecision } from "@protocol/builders";
import { canonicalJson } from "@protocol/canonical-json";
import { protocolUnsignedEventSchema, type ProtocolSignedEvent } from "@protocol/schemas";
import { assertPublicDataSafe } from "@protocol/validators";
import { LRP_EVENT_VERSION } from "@protocol/version";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import { validateReceivableAutomatically } from "@/db/repositories/receivable-repository";
import * as schema from "@/db/schema";
import { lrpOriginatorEvents, lrpReceivableOriginations, receivables, validations } from "@/db/schema";
import { publishPreparedOriginatorEvent } from "@/services/lrp-originator-event-publication-service";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;
type MigratingMode = Exclude<LrpOriginationMode, "LEGACY">;

export async function listOriginatorReceivables<THKT extends PgQueryResultHKT>(db: Database<THKT>, mode: MigratingMode) {
  return db.select({ receivableId: receivables.id, status: receivables.status, dueAt: receivables.dueAt })
    .from(receivables)
    .innerJoin(lrpReceivableOriginations, eq(lrpReceivableOriginations.receivableId, receivables.id))
    .where(and(eq(lrpReceivableOriginations.mode, mode), inArray(receivables.status, ["UNDER_VALIDATION", "APPROVED", "REJECTED"])))
    .limit(50);
}

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

function reasonCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64);
}

export async function evaluateAndPrepareValidationDecision<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { receivableId: string; mode: MigratingMode; originatorPubkey: string; now: Date; correlationId: string },
) {
  const [existing] = await db.select().from(lrpOriginatorEvents).where(and(
    eq(lrpOriginatorEvents.receivableId, input.receivableId),
    eq(lrpOriginatorEvents.eventType, "ClientValidationDecision"),
  )).limit(1);
  if (existing) {
    if (existing.mode !== input.mode || existing.originatorPubkey !== input.originatorPubkey) throw new Error("LRP_VALIDATION_IDEMPOTENCY_CONFLICT");
    return { ...publicResult(existing), duplicate: true };
  }
  const [origin] = await db.select().from(lrpReceivableOriginations).where(eq(lrpReceivableOriginations.receivableId, input.receivableId)).limit(1);
  const [commitment] = await db.select().from(lrpOriginatorEvents).where(and(
    eq(lrpOriginatorEvents.receivableId, input.receivableId),
    eq(lrpOriginatorEvents.eventType, "PayerCommitmentProof"),
  )).limit(1);
  if (!origin || !commitment?.candidateEvent) throw new Error("LRP_PAYER_COMMITMENT_REQUIRED");
  if (input.mode === "LRP" && commitment.status !== "PUBLISHED") throw new Error("LRP_PAYER_COMMITMENT_NOT_CANONICAL");
  const receivableEventId = input.mode === "LRP"
    ? origin.publicEventId
    : (JSON.parse(protocolUnsignedEventSchema.parse(commitment.candidateEvent).content) as { receivable_event_id: string }).receivable_event_id;
  if (!receivableEventId) throw new Error("LRP_RECEIVABLE_EVENT_PENDING");

  const evaluated = await validateReceivableAutomatically(db, { receivableId: input.receivableId, now: input.now, correlationId: input.correlationId });
  const [privateValidation] = await db.select().from(validations).where(eq(validations.id, evaluated.validationId)).limit(1);
  if (!privateValidation) throw new Error("LRP_PRIVATE_VALIDATION_NOT_FOUND");
  const privateReportHash = createHash("sha256").update(canonicalJson({
    validation_id: privateValidation.id,
    receivable_id: privateValidation.receivableId,
    receivable_version: privateValidation.receivableVersion,
    status: privateValidation.status,
    rules_version: privateValidation.rulesVersion,
    results: privateValidation.results as never,
    decision_reason: privateValidation.decisionReason,
  })).digest("hex");
  const decision = evaluated.outcome === "PASSED" ? "APPROVED" : evaluated.outcome === "FAILED" ? "REJECTED" : "NEEDS_INFORMATION";
  const id = randomUUID();
  const candidate = buildClientValidationDecision({
    protocol_version: LRP_EVENT_VERSION,
    event_type: "ClientValidationDecision",
    decision_id: id,
    receivable_event_id: receivableEventId,
    decision,
    policy_version: privateValidation.rulesVersion,
    reason_codes: [reasonCode(evaluated.reason)],
    decided_at: Math.floor(input.now.getTime() / 1000),
    private_report_hash: privateReportHash,
    client_pubkey: input.originatorPubkey,
  });
  protocolUnsignedEventSchema.parse(candidate);
  assertPublicDataSafe(JSON.parse(candidate.content));
  const [stored] = await db.insert(lrpOriginatorEvents).values({
    id,
    receivableId: input.receivableId,
    eventType: "ClientValidationDecision",
    mode: input.mode,
    status: input.mode === "SHADOW" ? "SHADOW_VALIDATED" : "CANDIDATE_READY",
    originatorPubkey: input.originatorPubkey,
    privateRecordId: privateValidation.id,
    privatePayloadHash: privateReportHash,
    candidateEvent: candidate,
    divergences: input.mode === "SHADOW" ? ["LEGACY_VALIDATION_REMAINS_CANONICAL"] : [],
  }).returning();
  return { ...publicResult(stored!), duplicate: false, decision };
}

export async function publishValidationDecision<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { originatorEventId: string; originatorPubkey: string; signedEvent?: ProtocolSignedEvent; clients: readonly ProtocolRelayClient[]; now: Date },
) {
  return publishPreparedOriginatorEvent(db, { ...input, eventType: "ClientValidationDecision" });
}
