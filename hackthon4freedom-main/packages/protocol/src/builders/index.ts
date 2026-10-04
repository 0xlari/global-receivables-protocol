import { z } from "zod";

import { canonicalJson, type JsonValue } from "../canonical-json";
import { PROTOCOL_KINDS, type ProtocolKind } from "../kinds";
import { LRP_EVENT_VERSION, LRP_IDENTIFIER, LRP_NAME } from "../version";
import {
  protocolContentSchemas,
  type ClientValidationDecision,
  type NwcAuthorizationAttestation,
  type PayerCommitmentProof,
  type PoolCreated,
  type PoolTransition,
  type ProtocolContent,
  type ProtocolDefinition,
  type ProtocolUnsignedEvent,
  type ReceivableCreated,
} from "../schemas";

const kindByType = {
  ProtocolDefinition: PROTOCOL_KINDS.PROTOCOL_DEFINITION,
  ReceivableCreated: PROTOCOL_KINDS.RECEIVABLE_CREATED,
  PayerCommitmentProof: PROTOCOL_KINDS.PAYER_COMMITMENT_PROOF,
  ClientValidationDecision: PROTOCOL_KINDS.CLIENT_VALIDATION_DECISION,
  NwcAuthorizationAttestation: PROTOCOL_KINDS.NWC_AUTHORIZATION_ATTESTATION,
  PoolCreated: PROTOCOL_KINDS.POOL_CREATED,
  PoolTransition: PROTOCOL_KINDS.POOL_TRANSITION,
} as const;

const altByType = {
  ProtocolDefinition: `Definição experimental do ${LRP_NAME}`,
  ReceivableCreated: "Recebível internacional experimental",
  PayerCommitmentProof: "Prova pública de compromisso do pagador",
  ClientValidationDecision: "Decisão independente de validação",
  NwcAuthorizationAttestation: "Atestado público de autorização NWC",
  PoolCreated: "Pool BTC experimental de recebível",
  PoolTransition: "Transição verificável de pool BTC",
} as const;

function schemaFor(kind: ProtocolKind): z.ZodType<ProtocolContent> {
  const schema = (protocolContentSchemas as Partial<Record<ProtocolKind, z.ZodType<ProtocolContent>>>)[kind];
  if (!schema) throw new Error("PROTOCOL_KIND_NOT_IMPLEMENTED");
  return schema;
}

function referenceTags(content: ProtocolContent): string[][] {
  switch (content.event_type) {
    case "ProtocolDefinition": return [["d", content.definition_id]];
    case "ReceivableCreated": return [["d", content.receivable_id], ["receivable", content.receivable_id]];
    case "PayerCommitmentProof": return [["d", content.proof_id], ["e", content.receivable_event_id, "", "receivable"], ["receivable", content.receivable_event_id], ["originator", content.originator_pubkey]];
    case "ClientValidationDecision": return [["d", content.decision_id], ["e", content.receivable_event_id, "", "receivable"], ["receivable", content.receivable_event_id], ["originator", content.client_pubkey]];
    case "NwcAuthorizationAttestation": return [["d", content.attestation_id], ["e", content.receivable_event_id, "", "receivable"], ["receivable", content.receivable_event_id], ["originator", content.executor_pubkey]];
    case "PoolCreated": return [
      ["d", content.pool_id], ["pool", content.pool_id], ["originator", content.originator_pubkey],
      ["e", content.receivable_event_id, "", "receivable"],
      ["e", content.payer_commitment_event_id, "", "payer-commitment"],
      ["e", content.approval_event_id, "", "approval"],
      ["e", content.nwc_attestation_event_id, "", "nwc-attestation"],
    ];
    case "PoolTransition": return [["d", content.transition_id], ["pool", content.pool_event_id], ["e", content.pool_event_id, "", "pool"], ["e", content.previous_event_id, "", "previous"], ...content.proof_event_ids.map((id) => ["e", id, "", "proof"] as string[])];
  }
}

export function buildProtocolEvent(kind: ProtocolKind, input: ProtocolContent): ProtocolUnsignedEvent {
  if (kindByType[input.event_type] !== kind) throw new Error("PROTOCOL_KIND_TYPE_MISMATCH");
  const content = schemaFor(kind).parse(input);
  const createdAt = "created_at" in content ? content.created_at
    : "published_at" in content ? content.published_at
      : "confirmed_at" in content ? content.confirmed_at
        : "decided_at" in content ? content.decided_at
          : "last_validated_at" in content ? content.last_validated_at
            : "terms_accepted_at" in content ? content.terms_accepted_at
              : content.transitioned_at;
  return {
    kind,
    created_at: createdAt,
    tags: [
      ["alt", altByType[content.event_type]],
      ["protocol", LRP_IDENTIFIER, LRP_EVENT_VERSION],
      ["t", content.event_type],
      ...referenceTags(content),
    ],
    content: canonicalJson(content as unknown as JsonValue),
  };
}

export const buildProtocolDefinition = (content: ProtocolDefinition) => buildProtocolEvent(PROTOCOL_KINDS.PROTOCOL_DEFINITION, content);
export const buildReceivableCreated = (content: ReceivableCreated) => buildProtocolEvent(PROTOCOL_KINDS.RECEIVABLE_CREATED, content);
export const buildPayerCommitmentProof = (content: PayerCommitmentProof) => buildProtocolEvent(PROTOCOL_KINDS.PAYER_COMMITMENT_PROOF, content);
export const buildClientValidationDecision = (content: ClientValidationDecision) => buildProtocolEvent(PROTOCOL_KINDS.CLIENT_VALIDATION_DECISION, content);
export const buildNwcAuthorizationAttestation = (content: NwcAuthorizationAttestation) => buildProtocolEvent(PROTOCOL_KINDS.NWC_AUTHORIZATION_ATTESTATION, content);
export const buildPoolCreated = (content: PoolCreated) => buildProtocolEvent(PROTOCOL_KINDS.POOL_CREATED, content);
export const buildPoolTransition = (content: PoolTransition) => buildProtocolEvent(PROTOCOL_KINDS.POOL_TRANSITION, content);
