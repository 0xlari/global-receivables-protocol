import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { ProtocolRelayClient } from "@nostr/relays";
import { buildPoolCreated } from "@protocol/builders";
import { canonicalJson } from "@protocol/canonical-json";
import { poolCreatedSchema, protocolSignedEventSchema, protocolUnsignedEventSchema, type PoolCreated, type ProtocolSignedEvent } from "@protocol/schemas";
import { assertPublicDataSafe, validatePoolCreationGraph, validateProtocolEvent } from "@protocol/validators";
import { LRP_EVENT_VERSION } from "@protocol/version";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import * as schema from "@/db/schema";
import { lrpOriginatorEvents, lrpPoolOriginations, lrpPublicationAttempts, lrpPublicEvents, lrpReceivableOriginations, nwcConnections, payerPaymentAuthorizations, poolQuotes, pools, receivables } from "@/db/schema";
import { calculateExpectedContributorReturnBps, simulatePool } from "@/domain/pool";
import { publishAndProjectLrpEvent } from "@/services/lrp-public-state-service";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;
type MigratingMode = Exclude<LrpOriginationMode, "LEGACY">;
type StoredTerms = {
  publicTerms: Omit<PoolCreated, "terms_accepted_at">;
  quoteId: string;
  nominalUsdCents: string;
  advanceUsdCents: string;
  rulesVersion: string;
};

function hash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value as never)).digest("hex");
}

function eventFromRow(row: typeof lrpPublicEvents.$inferSelect): ProtocolSignedEvent {
  return { id: row.eventId, kind: row.kind, pubkey: row.pubkey, created_at: row.eventCreatedAt, tags: row.tags as string[][], content: row.content, sig: row.signature };
}

function candidateReference(value: unknown) {
  return hash(protocolUnsignedEventSchema.parse(value));
}

function publicResult(row: typeof lrpPoolOriginations.$inferSelect) {
  const stored = row.termsPayload as StoredTerms;
  return {
    poolOriginationId: row.id,
    receivableId: row.receivableId,
    poolId: row.poolId,
    mode: row.mode,
    status: row.status,
    termsHash: row.termsHash,
    terms: stored.publicTerms,
    candidate: row.candidateEvent ? protocolUnsignedEventSchema.parse(row.candidateEvent) : undefined,
    publicEventId: row.publicEventId,
    divergences: row.divergences as readonly string[],
  };
}

async function assertActiveNwc<THKT extends PgQueryResultHKT>(db: Database<THKT>, receivableId: string, now: Date) {
  const [state] = await db.select({ authorization: payerPaymentAuthorizations, connection: nwcConnections })
    .from(payerPaymentAuthorizations).innerJoin(nwcConnections, eq(nwcConnections.authorizationId, payerPaymentAuthorizations.id))
    .where(eq(payerPaymentAuthorizations.receivableId, receivableId)).limit(1);
  const methods = state?.connection.supportedMethods as string[] | undefined;
  if (!state || state.authorization.method !== "NWC_AUTOMATIC" || state.authorization.status !== "ACTIVE" ||
      state.connection.status !== "ACTIVE" || state.authorization.revokedAt || state.connection.revokedAt ||
      state.authorization.expiresAt <= now || !methods?.includes("pay_invoice")) {
    throw new Error("LRP_POOL_ACTIVE_NWC_REQUIRED");
  }
  return state;
}

async function prerequisites<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: { receivableId: string; requesterId: string; mode: MigratingMode; now: Date }) {
  const [origin] = await db.select().from(lrpReceivableOriginations).where(and(eq(lrpReceivableOriginations.receivableId, input.receivableId), eq(lrpReceivableOriginations.requesterId, input.requesterId))).limit(1);
  const [receivable] = await db.select().from(receivables).where(eq(receivables.id, input.receivableId)).limit(1);
  if (!origin || !receivable) throw new Error("LRP_POOL_RECEIVABLE_NOT_FOUND");
  if (origin.mode !== input.mode) throw new Error("LRP_MODE_MISMATCH");
  if (receivable.status !== "APPROVED" || !receivable.clientAcceptedBtc) throw new Error("LRP_POOL_APPROVED_RECEIVABLE_REQUIRED");
  if (!origin.providerPubkey || !origin.candidateEvent) throw new Error("LRP_POOL_RECEIVABLE_EVENT_REQUIRED");
  const facts = await db.select().from(lrpOriginatorEvents).where(eq(lrpOriginatorEvents.receivableId, input.receivableId));
  const commitment = facts.find((item) => item.eventType === "PayerCommitmentProof");
  const approval = facts.find((item) => item.eventType === "ClientValidationDecision");
  const nwc = facts.find((item) => item.eventType === "NwcAuthorizationAttestation");
  if (!commitment?.candidateEvent) throw new Error("LRP_POOL_PAYER_COMMITMENT_REQUIRED");
  if (!approval?.candidateEvent) throw new Error("LRP_POOL_VALIDATION_DECISION_REQUIRED");
  if (!nwc?.candidateEvent) throw new Error("LRP_POOL_NWC_ATTESTATION_REQUIRED");
  const approvalContent = JSON.parse(protocolUnsignedEventSchema.parse(approval.candidateEvent).content) as { decision: string; client_pubkey: string };
  if (approvalContent.decision !== "APPROVED") throw new Error("LRP_POOL_APPROVAL_REQUIRED");
  if (!commitment.originatorPubkey || approval.originatorPubkey !== commitment.originatorPubkey || nwc.originatorPubkey !== commitment.originatorPubkey || approvalContent.client_pubkey !== commitment.originatorPubkey) throw new Error("LRP_POOL_ORIGINATOR_AUTHORITY_MISMATCH");
  const privateNwc = await assertActiveNwc(db, input.receivableId, input.now);
  if (input.mode === "LRP") {
    if (origin.status !== "PUBLISHED" || !origin.publicEventId || !origin.signedEvent) throw new Error("LRP_POOL_RECEIVABLE_NOT_CANONICAL");
    for (const fact of [commitment, approval, nwc]) if (fact.status !== "PUBLISHED" || !fact.publicEventId || !fact.signedEvent) throw new Error("LRP_POOL_PREREQUISITE_NOT_CANONICAL");
  }
  return { origin, receivable, commitment, approval, nwc, privateNwc, originatorPubkey: commitment.originatorPubkey };
}

async function ensureQuote<THKT extends PgQueryResultHKT>(db: Database<THKT>, receivableId: string, now: Date) {
  const sourceReference = `lrp-pool:${receivableId}:btc-usd-v1`;
  const [existing] = await db.select().from(poolQuotes).where(eq(poolQuotes.sourceReference, sourceReference)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(poolQuotes).values({
    id: randomUUID(), btcPriceUsdCents: 10_000_000n, source: "LRP_CONTROLLED_SIMULATION", sourceReference,
    spreadBps: 0, lightningFeeSats: 0n, swapFeeUsdCents: 0n, environment: "SIMULATION",
    quotedAt: now, expiresAt: new Date(now.getTime() + 15 * 60_000),
  }).returning();
  return created!;
}

export async function findProviderReceivableForPool<THKT extends PgQueryResultHKT>(db: Database<THKT>, requesterId: string, mode: MigratingMode) {
  const [origin] = await db.select({ receivableId: lrpReceivableOriginations.receivableId }).from(lrpReceivableOriginations)
    .innerJoin(receivables, eq(receivables.id, lrpReceivableOriginations.receivableId))
    .where(and(eq(lrpReceivableOriginations.requesterId, requesterId), eq(lrpReceivableOriginations.mode, mode), inArray(receivables.status, ["APPROVED", "POOLED"]))).limit(1);
  if (!origin) return undefined;
  const [pool] = await db.select().from(lrpPoolOriginations).where(eq(lrpPoolOriginations.receivableId, origin.receivableId)).limit(1);
  return { receivableId: origin.receivableId, pool: pool ? publicResult(pool) : undefined };
}

export async function previewPoolCreated<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: { receivableId: string; requesterId: string; mode: MigratingMode; now: Date }) {
  const [existing] = await db.select().from(lrpPoolOriginations).where(eq(lrpPoolOriginations.receivableId, input.receivableId)).limit(1);
  if (existing) {
    if (existing.requesterId !== input.requesterId || existing.mode !== input.mode) throw new Error("LRP_POOL_IDEMPOTENCY_CONFLICT");
    return { ...publicResult(existing), duplicate: true };
  }
  const state = await prerequisites(db, input);
  const quote = await ensureQuote(db, input.receivableId, input.now);
  const daysToDue = Math.ceil((state.receivable.dueAt.getTime() - input.now.getTime()) / 86_400_000);
  const simulation = simulatePool({ mode: "FULL_BTC", nominalUsdCents: state.receivable.nominalAmount, daysToDue, risk: "LOW", btcPriceUsdCents: quote.btcPriceUsdCents, externalCostsUsdCents: quote.swapFeeUsdCents });
  const root = JSON.parse(protocolUnsignedEventSchema.parse(state.origin.candidateEvent).content) as { title: string; provider_pseudonym: string; original_currency: string; due_at: number };
  const reference = (row: typeof lrpOriginatorEvents.$inferSelect) => input.mode === "LRP" ? row.publicEventId! : candidateReference(row.candidateEvent);
  const receivableReference = input.mode === "LRP" ? state.origin.publicEventId! : candidateReference(state.origin.candidateEvent);
  const fundingDeadline = Math.min(Math.floor(input.now.getTime() / 1000) + 7 * 86_400, root.due_at - 86_400);
  if (fundingDeadline <= Math.floor(input.now.getTime() / 1000)) throw new Error("LRP_POOL_FUNDING_WINDOW_INVALID");
  const poolId = randomUUID();
  const publicTerms: Omit<PoolCreated, "terms_accepted_at"> = {
    protocol_version: LRP_EVENT_VERSION, event_type: "PoolCreated", pool_id: poolId, title: root.title,
    provider_pseudonym: root.provider_pseudonym, public_reputation_facts: [], receivable_event_id: receivableReference,
    payer_commitment_event_id: reference(state.commitment), approval_event_id: reference(state.approval), nwc_attestation_event_id: reference(state.nwc),
    originator_pubkey: state.originatorPubkey!, original_currency: root.original_currency, target_sats: simulation.fundingTargetSats.toString(),
    minimum_partial_bps: 5000, funding_deadline: fundingDeadline, due_at: root.due_at, discount_bps: simulation.discountBps,
    expected_return_bps: calculateExpectedContributorReturnBps(simulation.discountBps), client_fees_sats: quote.lightningFeeSats.toString(),
    fixed_late_fee_bps: 200, daily_late_interest_bps: 10, maximum_penalty_bps: 1000,
    partial_funding_policy: "PROVIDER_DECIDES_AT_OR_ABOVE_MINIMUM", partial_acceptance_window_seconds: 86_400,
    cancellation_policy: "REFUND_BEFORE_DISBURSEMENT", dispute_policy: "ORIGINATOR_COORDINATED_V0_1", originator_concentrates_operational_roles: true,
  };
  assertPublicDataSafe(publicTerms);
  const stored: StoredTerms = { publicTerms, quoteId: quote.id, nominalUsdCents: simulation.nominalUsdCents.toString(), advanceUsdCents: simulation.advanceUsdCents.toString(), rulesVersion: simulation.rulesVersion };
  const [created] = await db.insert(lrpPoolOriginations).values({ id: randomUUID(), receivableId: input.receivableId, poolId, requesterId: input.requesterId, mode: input.mode, providerPubkey: state.origin.providerPubkey, termsPayload: stored, termsHash: hash(publicTerms) }).returning();
  return { ...publicResult(created!), duplicate: false };
}

async function activatePrivatePool<THKT extends PgQueryResultHKT>(db: Database<THKT>, row: typeof lrpPoolOriginations.$inferSelect, now: Date) {
  const stored = row.termsPayload as StoredTerms;
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(pools).where(eq(pools.receivableId, row.receivableId)).limit(1);
    if (!existing) await tx.insert(pools).values({ id: row.poolId, receivableId: row.receivableId, quoteId: stored.quoteId, mode: "FULL_BTC", riskBand: "LOW", environment: "SIMULATION", rulesVersion: stored.rulesVersion, fundingAsset: "BTC", settlementAsset: "BTC", nominalUsdCents: BigInt(stored.nominalUsdCents), advanceUsdCents: BigInt(stored.advanceUsdCents), discountBps: stored.publicTerms.discount_bps, targetAmount: BigInt(stored.publicTerms.target_sats), status: "DRAFT", closesAt: new Date(stored.publicTerms.funding_deadline * 1000) });
    else if (existing.id !== row.poolId) throw new Error("LRP_POOL_RECEIVABLE_ALREADY_HAS_POOL");
    await tx.update(receivables).set({ status: "POOLED", updatedAt: now }).where(and(eq(receivables.id, row.receivableId), eq(receivables.status, "APPROVED")));
    await tx.update(pools).set({ status: "OPEN", updatedAt: now }).where(and(eq(pools.id, row.poolId), eq(pools.status, "DRAFT")));
  });
}

export async function acceptAndPreparePoolCreated<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: { poolOriginationId: string; requesterId: string; termsHash: string; consent: true; now: Date }) {
  const [row] = await db.select().from(lrpPoolOriginations).where(and(eq(lrpPoolOriginations.id, input.poolOriginationId), eq(lrpPoolOriginations.requesterId, input.requesterId))).limit(1);
  if (!row) throw new Error("LRP_POOL_ORIGINATION_NOT_FOUND");
  if (row.termsHash !== input.termsHash || hash((row.termsPayload as StoredTerms).publicTerms) !== row.termsHash) throw new Error("LRP_POOL_TERMS_CHANGED");
  if (row.candidateEvent) return { ...publicResult(row), duplicate: true };
  await prerequisites(db, { receivableId: row.receivableId, requesterId: input.requesterId, mode: row.mode as MigratingMode, now: input.now });
  const content = poolCreatedSchema.parse({ ...(row.termsPayload as StoredTerms).publicTerms, terms_accepted_at: Math.floor(input.now.getTime() / 1000) });
  assertPublicDataSafe(content);
  const candidate = buildPoolCreated(content);
  const [updated] = await db.update(lrpPoolOriginations).set({ consentedAt: input.now, candidateEvent: candidate, status: row.mode === "SHADOW" ? "SHADOW_VALIDATED" : "CANDIDATE_READY", divergences: row.mode === "SHADOW" ? ["LEGACY_POOL_REMAINS_CANONICAL"] : [], updatedAt: input.now }).where(eq(lrpPoolOriginations.id, row.id)).returning();
  if (row.mode === "SHADOW") await activatePrivatePool(db, updated!, input.now);
  return { ...publicResult(updated!), duplicate: false };
}

export async function publishPreparedPoolCreated<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: { poolOriginationId: string; requesterId: string; signedEvent?: ProtocolSignedEvent; clients: readonly ProtocolRelayClient[]; now: Date }) {
  const [row] = await db.select().from(lrpPoolOriginations).where(and(eq(lrpPoolOriginations.id, input.poolOriginationId), eq(lrpPoolOriginations.requesterId, input.requesterId))).limit(1);
  if (!row || row.mode !== "LRP" || !row.candidateEvent || !row.providerPubkey) throw new Error("LRP_POOL_NOT_READY_FOR_PUBLICATION");
  await prerequisites(db, { receivableId: row.receivableId, requesterId: input.requesterId, mode: "LRP", now: input.now });
  if (hash((row.termsPayload as StoredTerms).publicTerms) !== row.termsHash) throw new Error("LRP_POOL_TERMS_CHANGED");
  const candidate = protocolUnsignedEventSchema.parse(row.candidateEvent);
  const signed = input.signedEvent ? protocolSignedEventSchema.parse(input.signedEvent) : row.signedEvent ? protocolSignedEventSchema.parse(row.signedEvent) : undefined;
  if (!signed) throw new Error("LRP_SIGNED_EVENT_REQUIRED");
  if (signed.pubkey !== row.providerPubkey || signed.kind !== candidate.kind || signed.created_at !== candidate.created_at || signed.content !== candidate.content || JSON.stringify(signed.tags) !== JSON.stringify(candidate.tags)) throw new Error("LRP_SIGNED_EVENT_DOES_NOT_MATCH_CANDIDATE");
  const validated = validateProtocolEvent(signed);
  if (!validated.valid || validated.value.content.event_type !== "PoolCreated") throw new Error("LRP_POOL_EVENT_INVALID");
  if (row.signedEvent && JSON.stringify(protocolSignedEventSchema.parse(row.signedEvent)) !== JSON.stringify(signed)) throw new Error("LRP_SIGNED_EVENT_RETRY_CONFLICT");
  const storedGraph = await db.select().from(lrpPublicEvents);
  const graphValidation = validatePoolCreationGraph(signed, storedGraph.map(eventFromRow));
  if (!graphValidation.valid) throw new Error(`LRP_POOL_GRAPH_INVALID:${graphValidation.reason}`);
  await db.update(lrpPoolOriginations).set({ signedEvent: signed, updatedAt: input.now }).where(eq(lrpPoolOriginations.id, row.id));
  const idempotencyKey = `pool:${row.poolId}:created`;
  try {
    const publication = await publishAndProjectLrpEvent(db, { mode: "LRP", event: signed, entityType: "POOL", privateEntityId: row.poolId, idempotencyKey, clients: input.clients, now: input.now });
    const [updated] = await db.update(lrpPoolOriginations).set({ status: publication.status === "CONFIRMED" ? "PUBLISHED" : "PUBLICATION_PENDING", publicEventId: signed.id, canonicalSource: publication.status === "CONFIRMED" ? "LRP" : "LEGACY", updatedAt: input.now }).where(eq(lrpPoolOriginations.id, row.id)).returning();
    if (publication.status === "CONFIRMED") await activatePrivatePool(db, updated!, input.now);
    return { ...publicResult(updated!), publicationStatus: publication.status, event: signed };
  } catch (error) {
    const [attempt] = await db.select().from(lrpPublicationAttempts).where(eq(lrpPublicationAttempts.idempotencyKey, idempotencyKey)).limit(1);
    if (attempt?.status === "CONFIRMED") {
      const [updated] = await db.update(lrpPoolOriginations).set({ status: "PROJECTION_PENDING", publicEventId: signed.id, canonicalSource: "LRP", updatedAt: input.now }).where(eq(lrpPoolOriginations.id, row.id)).returning();
      await activatePrivatePool(db, updated!, input.now);
      return { ...publicResult(updated!), publicationStatus: "CONFIRMED" as const, projectionPending: true, event: signed };
    }
    throw error;
  }
}
