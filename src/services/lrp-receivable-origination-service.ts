import { randomUUID } from "node:crypto";

import { and, eq, notInArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { buildReceivableCreated } from "@protocol/builders";
import {
  protocolSignedEventSchema,
  protocolUnsignedEventSchema,
  receivableCreatedSchema,
  type ProtocolSignedEvent,
  type ProtocolUnsignedEvent,
  type ReceivableCreated,
} from "@protocol/schemas";
import { LRP_EVENT_VERSION } from "@protocol/version";
import { assertPublicDataSafe, validateProtocolEvent } from "@protocol/validators";
import type { ProtocolRelayClient } from "@nostr/relays";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import { submitReceivableWithinTransaction } from "@/db/repositories/receivable-repository";
import * as schema from "@/db/schema";
import {
  clients,
  lrpPublicationAttempts,
  lrpReceivableOriginations,
  receivableEvidences,
  receivableVersions,
  receivables,
} from "@/db/schema";
import type { EvidenceMetadata, PaymentPurpose } from "@/domain/receivable";
import { publishAndProjectLrpEvent } from "@/services/lrp-public-state-service";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;
type MigratingMode = Exclude<LrpOriginationMode, "LEGACY">;

export type PrivateReceivableDraftInput = Readonly<{
  requestKey: string;
  requesterId: string;
  mode: MigratingMode;
  paymentDescription: string;
  paymentPurpose: PaymentPurpose;
  nominalUsdCents: bigint;
  dueAt: Date;
  payerName: string;
  payerCountry: string;
  evidenceName: string;
  evidence: EvidenceMetadata;
  publicPseudonym: string;
  now: Date;
  confirmationExpiresAt: Date;
  confirmationBaseUrl: string;
}>;

function publicCandidate(row: typeof lrpReceivableOriginations.$inferSelect) {
  return row.candidateEvent ? protocolUnsignedEventSchema.parse(row.candidateEvent) : undefined;
}

function publicResult(row: typeof lrpReceivableOriginations.$inferSelect, confirmationUrl?: string) {
  return {
    draftId: row.id,
    receivableId: row.receivableId,
    mode: row.mode,
    status: row.status,
    candidate: publicCandidate(row),
    publicEventId: row.publicEventId,
    divergences: row.divergences as readonly string[],
    ...(confirmationUrl ? { confirmationUrl } : {}),
  };
}

const publicTitles: Record<PaymentPurpose, string> = {
  SERVICE: "Pagamento internacional por serviço",
  SALARY: "Pagamento internacional de salário",
  SALE: "Pagamento internacional por venda",
  COMMISSION: "Pagamento internacional de comissão",
  OTHER: "Pagamento internacional",
};

export async function createPrivateReceivableDraft<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: PrivateReceivableDraftInput,
) {
  const [existing] = await db.select().from(lrpReceivableOriginations)
    .where(eq(lrpReceivableOriginations.requestKey, input.requestKey)).limit(1);
  if (existing) {
    if (existing.requesterId !== input.requesterId || existing.mode !== input.mode) {
      throw new Error("LRP_RECEIVABLE_IDEMPOTENCY_CONFLICT");
    }
    return { ...publicResult(existing), duplicate: true };
  }

  return db.transaction(async (tx) => {
    const [active] = await tx.select({ id: receivables.id }).from(receivables).where(and(
      eq(receivables.requesterId, input.requesterId),
      notInArray(receivables.status, ["REJECTED", "CLOSED"]),
    )).limit(1);
    if (active) throw new Error("ACTIVE_RECEIVABLE_ALREADY_EXISTS");

    const clientId = randomUUID();
    await tx.insert(clients).values({
      id: clientId,
      countryCode: input.payerCountry,
      protectedContactRef: `lrp-private/${input.requestKey}`,
    });
    const submitted = await submitReceivableWithinTransaction(tx, {
      requesterId: input.requesterId,
      clientId,
      paymentDescription: input.paymentDescription,
      paymentPurpose: input.paymentPurpose,
      nominalUsdCents: input.nominalUsdCents,
      dueAt: input.dueAt,
      evidence: input.evidence,
      now: input.now,
      confirmationExpiresAt: input.confirmationExpiresAt,
      confirmationBaseUrl: input.confirmationBaseUrl,
    });
    const [created] = await tx.insert(lrpReceivableOriginations).values({
      id: randomUUID(),
      requestKey: input.requestKey,
      receivableId: submitted.receivableId,
      requesterId: input.requesterId,
      mode: input.mode,
      publicPseudonym: input.publicPseudonym,
      privatePayload: {
        payerName: input.payerName,
        payerCountry: input.payerCountry,
        evidenceName: input.evidenceName,
        confirmationUrl: submitted.confirmationUrl,
      },
    }).returning();
    return { ...publicResult(created!, submitted.confirmationUrl), duplicate: false };
  });
}

export async function prepareReceivableCandidate<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { draftId: string; requesterId: string; providerPubkey?: string },
) {
  const [row] = await db.select().from(lrpReceivableOriginations).where(and(
    eq(lrpReceivableOriginations.id, input.draftId),
    eq(lrpReceivableOriginations.requesterId, input.requesterId),
  )).limit(1);
  if (!row) throw new Error("LRP_RECEIVABLE_DRAFT_NOT_FOUND");
  if (row.candidateEvent) return { ...publicResult(row), duplicate: true };

  const [privateState] = await db.select({
    receivable: receivables,
    version: receivableVersions,
    evidence: receivableEvidences,
  }).from(receivables)
    .innerJoin(receivableVersions, and(
      eq(receivableVersions.receivableId, receivables.id),
      eq(receivableVersions.version, receivables.version),
    ))
    .innerJoin(receivableEvidences, and(
      eq(receivableEvidences.receivableId, receivables.id),
      eq(receivableEvidences.receivableVersion, receivables.version),
    ))
    .where(eq(receivables.id, row.receivableId)).limit(1);
  if (!privateState) throw new Error("LRP_RECEIVABLE_PRIVATE_STATE_NOT_FOUND");

  const providerPubkey = input.providerPubkey ?? "0".repeat(64);
  if (row.mode === "LRP" && !input.providerPubkey) throw new Error("LRP_SIGNER_REQUIRED");
  const content: ReceivableCreated = {
    protocol_version: LRP_EVENT_VERSION,
    event_type: "ReceivableCreated",
    receivable_id: row.receivableId,
    title: publicTitles[privateState.version.paymentPurpose],
    provider_pseudonym: row.publicPseudonym,
    provider_pubkey: providerPubkey,
    nominal_amount_minor: privateState.version.nominalAmount.toString(),
    original_currency: "USD",
    due_at: Math.floor(privateState.version.dueAt.getTime() / 1000),
    category: privateState.version.paymentPurpose,
    country: "BR",
    private_evidence_hash: privateState.evidence.sha256,
    receivable_version: privateState.version.version,
    created_at: Math.floor(row.createdAt.getTime() / 1000),
  };
  receivableCreatedSchema.parse(content);
  assertPublicDataSafe(content);
  const candidate = buildReceivableCreated(content);
  protocolUnsignedEventSchema.parse(candidate);
  const divergences = row.mode === "SHADOW"
    ? ["PUBLIC_TITLE_REDACTED", ...(!input.providerPubkey ? ["PROVIDER_SIGNER_NOT_LINKED"] : [])]
    : [];
  const status = row.mode === "SHADOW" ? "SHADOW_VALIDATED" : "CANDIDATE_READY";
  const [updated] = await db.update(lrpReceivableOriginations).set({
    providerPubkey,
    candidateEvent: candidate,
    divergences,
    status,
    updatedAt: new Date(),
  }).where(eq(lrpReceivableOriginations.id, row.id)).returning();
  return { ...publicResult(updated!), duplicate: false };
}

function assertExactCandidate(
  candidate: ProtocolUnsignedEvent,
  signed: ProtocolSignedEvent,
  expectedPubkey: string,
) {
  if (signed.pubkey !== expectedPubkey || signed.kind !== candidate.kind ||
      signed.created_at !== candidate.created_at || signed.content !== candidate.content ||
      JSON.stringify(signed.tags) !== JSON.stringify(candidate.tags)) {
    throw new Error("LRP_SIGNED_EVENT_DOES_NOT_MATCH_CANDIDATE");
  }
  const validation = validateProtocolEvent(signed);
  if (!validation.valid || validation.value.content.event_type !== "ReceivableCreated") {
    throw new Error(`LRP_SIGNED_EVENT_INVALID:${validation.valid ? "WRONG_TYPE" : validation.reason}`);
  }
}

export async function publishPreparedReceivable<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    draftId: string;
    requesterId: string;
    signedEvent?: ProtocolSignedEvent;
    clients: readonly ProtocolRelayClient[];
    now?: Date;
  },
) {
  const [row] = await db.select().from(lrpReceivableOriginations).where(and(
    eq(lrpReceivableOriginations.id, input.draftId),
    eq(lrpReceivableOriginations.requesterId, input.requesterId),
  )).limit(1);
  if (!row || row.mode !== "LRP" || !row.candidateEvent || !row.providerPubkey) {
    throw new Error("LRP_RECEIVABLE_NOT_READY_FOR_PUBLICATION");
  }
  const candidate = protocolUnsignedEventSchema.parse(row.candidateEvent);
  const signed = input.signedEvent
    ? protocolSignedEventSchema.parse(input.signedEvent)
    : row.signedEvent ? protocolSignedEventSchema.parse(row.signedEvent) : undefined;
  if (!signed) throw new Error("LRP_SIGNED_EVENT_REQUIRED");
  assertExactCandidate(candidate, signed, row.providerPubkey);
  if (row.signedEvent) {
    const storedSigned = protocolSignedEventSchema.parse(row.signedEvent);
    const exactRetry = storedSigned.id === signed.id && storedSigned.pubkey === signed.pubkey &&
      storedSigned.sig === signed.sig && storedSigned.kind === signed.kind &&
      storedSigned.created_at === signed.created_at && storedSigned.content === signed.content &&
      JSON.stringify(storedSigned.tags) === JSON.stringify(signed.tags);
    if (!exactRetry) throw new Error("LRP_SIGNED_EVENT_RETRY_CONFLICT");
  }
  await db.update(lrpReceivableOriginations).set({ signedEvent: signed, updatedAt: input.now ?? new Date() })
    .where(eq(lrpReceivableOriginations.id, row.id));

  const idempotencyKey = `receivable:${row.receivableId}:created`;
  try {
    const result = await publishAndProjectLrpEvent(db, {
      mode: "LRP",
      event: signed,
      entityType: "RECEIVABLE",
      privateEntityId: row.receivableId,
      idempotencyKey,
      clients: input.clients,
      now: input.now,
    });
    const status = result.status === "CONFIRMED" ? "PUBLISHED" : "PUBLICATION_PENDING";
    const [updated] = await db.update(lrpReceivableOriginations).set({
      status,
      publicEventId: signed.id,
      canonicalSource: result.status === "CONFIRMED" ? "LRP" : "LEGACY",
      updatedAt: input.now ?? new Date(),
    }).where(eq(lrpReceivableOriginations.id, row.id)).returning();
    return { ...publicResult(updated!), publicationStatus: result.status, event: signed };
  } catch (error) {
    const [publication] = await db.select().from(lrpPublicationAttempts)
      .where(eq(lrpPublicationAttempts.idempotencyKey, idempotencyKey)).limit(1);
    if (publication?.status === "CONFIRMED") {
      const [updated] = await db.update(lrpReceivableOriginations).set({
        status: "PROJECTION_PENDING",
        publicEventId: signed.id,
        canonicalSource: "LRP",
        updatedAt: input.now ?? new Date(),
      }).where(eq(lrpReceivableOriginations.id, row.id)).returning();
      return { ...publicResult(updated!), publicationStatus: "CONFIRMED" as const, projectionPending: true, event: signed };
    }
    throw error;
  }
}
