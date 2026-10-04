import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Event } from "nostr-tools";
import * as schema from "@/db/schema";
import { nostrAttestations, nostrRelayPublications, users } from "@/db/schema";
import { buildAttestationTemplate, type NostrEventSigner, type PositiveAssertion, validateSignedAttestation } from "@/domain/nostr-attestation";
import { publishToRelays, type NostrRelayGateway } from "@/integrations/nostr/relay";

export async function createSignedAttestation<THKT extends PgQueryResultHKT>(db: PgDatabase<THKT, typeof schema>, signer: NostrEventSigner, input: { subjectUserId: string; semanticKey: string; assertion: PositiveAssertion; operationRef: string; evidenceHash: string; occurredAt: Date; correctionOfId?: string }) {
  const duplicate = await db.select().from(nostrAttestations).where(eq(nostrAttestations.semanticKey, input.semanticKey)).limit(1);
  if (duplicate[0]) return { attestationId: duplicate[0].id, eventId: duplicate[0].eventId, duplicate: true };
  const [subject] = await db.select({ reputationId: users.reputationId }).from(users).where(eq(users.id, input.subjectUserId)).limit(1);
  if (!subject?.reputationId) throw new Error("REPUTATION_SUBJECT_NOT_AVAILABLE");
  let correctionEventId: string | undefined;
  if (input.correctionOfId) {
    const [previous] = await db.select().from(nostrAttestations).where(eq(nostrAttestations.id, input.correctionOfId)).limit(1);
    if (!previous) throw new Error("NOSTR_CORRECTION_TARGET_NOT_FOUND");
    correctionEventId = previous.eventId;
  }
  const event = await signer.signEvent(buildAttestationTemplate({ subjectReputationId: subject.reputationId, assertion: input.assertion, operationRef: input.operationRef, evidenceHash: input.evidenceHash, occurredAt: input.occurredAt, correctionOf: correctionEventId }));
  validateSignedAttestation(event);
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(nostrAttestations).values({ id, subjectUserId: input.subjectUserId, semanticKey: input.semanticKey, assertion: input.assertion, operationRef: input.operationRef, evidenceHash: input.evidenceHash, eventId: event.id, signedEvent: event, correctionOfId: input.correctionOfId, occurredAt: input.occurredAt });
    if (input.correctionOfId) await tx.update(nostrAttestations).set({ status: "CORRECTED" }).where(eq(nostrAttestations.id, input.correctionOfId));
  });
  return { attestationId: id, eventId: event.id, duplicate: false };
}

export async function publishAttestation<THKT extends PgQueryResultHKT>(db: PgDatabase<THKT, typeof schema>, gateway: NostrRelayGateway, input: { attestationId: string; relays: string[]; now?: Date }) {
  const [stored] = await db.select().from(nostrAttestations).where(eq(nostrAttestations.id, input.attestationId)).limit(1);
  if (!stored) throw new Error("NOSTR_ATTESTATION_NOT_FOUND");
  const event = stored.signedEvent as Event;
  validateSignedAttestation(event);
  const results = await publishToRelays(gateway, input.relays, event);
  const now = input.now ?? new Date();
  for (const result of results) {
    const acknowledged = result.status === "ACKNOWLEDGED";
    await db.insert(nostrRelayPublications).values({ id: randomUUID(), attestationId: stored.id, relayUrl: result.relayUrl, status: result.status, attempts: 1, lastErrorCode: "errorCode" in result ? result.errorCode : null, acknowledgedAt: acknowledged ? now : null, observedEventHash: "observedEventHash" in result ? result.observedEventHash : null }).onConflictDoUpdate({ target: [nostrRelayPublications.attestationId, nostrRelayPublications.relayUrl], set: { status: result.status, lastErrorCode: "errorCode" in result ? result.errorCode : null, acknowledgedAt: acknowledged ? now : null, observedEventHash: "observedEventHash" in result ? result.observedEventHash : null, updatedAt: now } });
  }
  const acknowledged = results.filter((result) => result.status === "ACKNOWLEDGED").length;
  if (acknowledged >= 2) await db.update(nostrAttestations).set({ status: "PUBLISHED", publishedAt: now }).where(eq(nostrAttestations.id, stored.id));
  return { acknowledged, results };
}
