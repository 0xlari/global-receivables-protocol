import { createHash, randomBytes } from "node:crypto";
import type { Event, EventTemplate } from "nostr-tools";
import { verifyEvent } from "nostr-tools/pure";

export const NOSTR_ATTESTATION_KIND = 30078;
export const positiveAssertions = [
  "identity_level_verified",
  "receivable_confirmed",
  "pool_funded",
  "repayment_on_time",
  "operation_completed",
  "dispute_resolved",
  "badge_awarded",
] as const;
export type PositiveAssertion = (typeof positiveAssertions)[number];

const forbidden = /(amount|currency|payer|client|contract|contact|email|phone|address|due_date|location)/i;

export type AttestationContent = {
  schema: "erh.reputation.v1";
  subject: string;
  assertion: PositiveAssertion;
  operation_ref: string;
  occurred_at: string;
  evidence_hash: string;
  issuer_role: "platform";
  correction_of?: string;
};

export interface NostrEventSigner {
  readonly method: "institutional" | "nip07" | "nip46";
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<Event>;
}

export function opaqueOperationReference() {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

export function buildAttestationTemplate(input: {
  subjectReputationId: string;
  assertion: PositiveAssertion;
  operationRef: string;
  evidenceHash: string;
  occurredAt: Date;
  correctionOf?: string;
}): EventTemplate {
  const content: AttestationContent = {
    schema: "erh.reputation.v1",
    subject: input.subjectReputationId,
    assertion: input.assertion,
    operation_ref: input.operationRef,
    occurred_at: input.occurredAt.toISOString(),
    evidence_hash: input.evidenceHash,
    issuer_role: "platform",
    ...(input.correctionOf ? { correction_of: input.correctionOf } : {}),
  };
  const serialized = JSON.stringify(content);
  if (forbidden.test(serialized)) throw new Error("ATTESTATION_CONTAINS_FORBIDDEN_FIELD");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.subjectReputationId) || !/^[a-f0-9]{64}$/.test(input.operationRef) || !/^[a-f0-9]{64}$/.test(input.evidenceHash)) throw new Error("INVALID_ATTESTATION_REFERENCE");

  return {
    kind: NOSTR_ATTESTATION_KIND,
    created_at: Math.floor(input.occurredAt.getTime() / 1000),
    tags: [
      ["d", `${input.subjectReputationId}:${input.assertion}:${input.operationRef}`],
      ["t", input.assertion],
      ...(input.correctionOf ? [["e", input.correctionOf, "", "correction"]] : []),
    ],
    content: serialized,
  };
}

export function validateSignedAttestation(event: Event) {
  if (event.kind !== NOSTR_ATTESTATION_KIND || !verifyEvent(event)) throw new Error("INVALID_SIGNED_ATTESTATION");
  if (forbidden.test(event.content)) throw new Error("ATTESTATION_CONTAINS_FORBIDDEN_FIELD");
  const content = JSON.parse(event.content) as AttestationContent;
  if (content.schema !== "erh.reputation.v1" || !positiveAssertions.includes(content.assertion)) throw new Error("INVALID_ATTESTATION_SCHEMA");
  return content;
}
