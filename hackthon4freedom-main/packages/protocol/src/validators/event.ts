import { verifyEvent } from "nostr-tools/pure";
import { z } from "zod";

import { PROTOCOL_KINDS, type ProtocolKind } from "../kinds";
import { protocolContentSchemas, protocolSignedEventSchema, type ProtocolContent, type ProtocolSignedEvent } from "../schemas";
import { LRP_EVENT_VERSION, LRP_IDENTIFIER } from "../version";
import { assertPublicDataSafe } from "./privacy";

const expectedType: Partial<Record<ProtocolKind, ProtocolContent["event_type"]>> = {
  [PROTOCOL_KINDS.PROTOCOL_DEFINITION]: "ProtocolDefinition",
  [PROTOCOL_KINDS.RECEIVABLE_CREATED]: "ReceivableCreated",
  [PROTOCOL_KINDS.PAYER_COMMITMENT_PROOF]: "PayerCommitmentProof",
  [PROTOCOL_KINDS.CLIENT_VALIDATION_DECISION]: "ClientValidationDecision",
  [PROTOCOL_KINDS.NWC_AUTHORIZATION_ATTESTATION]: "NwcAuthorizationAttestation",
  [PROTOCOL_KINDS.POOL_CREATED]: "PoolCreated",
  [PROTOCOL_KINDS.POOL_TRANSITION]: "PoolTransition",
};

export type ValidatedProtocolEvent = Readonly<{ event: ProtocolSignedEvent; content: ProtocolContent }>;
export type ProtocolEventValidation = Readonly<{ valid: true; value: ValidatedProtocolEvent }> | Readonly<{ valid: false; reason: string; issues?: readonly string[] }>;

export function validateProtocolEvent(input: unknown): ProtocolEventValidation {
  const envelope = protocolSignedEventSchema.safeParse(input);
  if (!envelope.success) return { valid: false, reason: "INVALID_EVENT_ENVELOPE" };
  const event = envelope.data;
  if (!verifyEvent(event)) return { valid: false, reason: "INVALID_NOSTR_SIGNATURE" };
  const kind = event.kind as ProtocolKind;
  const schema = (protocolContentSchemas as Partial<Record<ProtocolKind, z.ZodType<ProtocolContent>>>)[kind];
  if (!schema) return { valid: false, reason: "UNSUPPORTED_PROTOCOL_KIND" };
  let json: unknown;
  try { json = JSON.parse(event.content); } catch { return { valid: false, reason: "INVALID_CONTENT_JSON" }; }
  try { assertPublicDataSafe(json); } catch (error) {
    return { valid: false, reason: "FORBIDDEN_PUBLIC_DATA", issues: (error as { issues?: string[] }).issues };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { valid: false, reason: "INVALID_CONTENT_SCHEMA", issues: parsed.error.issues.map((issue) => issue.path.join(".")) };
  if (parsed.data.event_type !== expectedType[kind]) return { valid: false, reason: "PROTOCOL_KIND_TYPE_MISMATCH" };
  if (!event.tags.some((tag) => tag[0] === "alt" && Boolean(tag[1]))) return { valid: false, reason: "ALT_TAG_REQUIRED" };
  if (!event.tags.some((tag) => tag[0] === "protocol" && tag[1] === LRP_IDENTIFIER && tag[2] === LRP_EVENT_VERSION)) return { valid: false, reason: "PROTOCOL_TAG_REQUIRED" };
  if (parsed.data.event_type === "ReceivableCreated" && parsed.data.provider_pubkey !== event.pubkey) return { valid: false, reason: "PROVIDER_AUTHOR_MISMATCH" };
  if (parsed.data.event_type === "PayerCommitmentProof" && parsed.data.originator_pubkey !== event.pubkey) return { valid: false, reason: "ORIGINATOR_AUTHOR_MISMATCH" };
  if (parsed.data.event_type === "ClientValidationDecision" && parsed.data.client_pubkey !== event.pubkey) return { valid: false, reason: "CLIENT_AUTHOR_MISMATCH" };
  if (parsed.data.event_type === "NwcAuthorizationAttestation" && parsed.data.executor_pubkey !== event.pubkey) return { valid: false, reason: "EXECUTOR_AUTHOR_MISMATCH" };
  if (parsed.data.event_type === "PoolTransition" && parsed.data.actor_pubkey !== event.pubkey) return { valid: false, reason: "ACTOR_AUTHOR_MISMATCH" };
  return { valid: true, value: { event, content: parsed.data } };
}
