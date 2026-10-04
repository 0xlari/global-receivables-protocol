import { z } from "zod";

import { PROTOCOL_KINDS } from "../kinds";
import { LRP_EVENT_VERSION } from "../version";
import {
  basisPointsSchema,
  countryCodeSchema,
  currencyCodeSchema,
  hex64Schema,
  opaqueIdSchema,
  positiveIntegerStringSchema,
  safePublicTextSchema,
  unixTimestampSchema,
  unsignedIntegerStringSchema,
  wssRelaySchema,
} from "./common";

const base = <T extends string>(eventType: T) => ({
  protocol_version: z.literal(LRP_EVENT_VERSION),
  event_type: z.literal(eventType),
});

export const protocolDefinitionSchema = z.object({
  ...base("ProtocolDefinition"),
  definition_id: opaqueIdSchema,
  name: safePublicTextSchema,
  supported_kinds: z.array(z.object({ name: z.string().min(3).max(64), kind: z.number().int().min(8100).max(8114) }).strict()).length(15),
  specification_hash: hex64Schema,
  recommended_relays: z.array(wssRelaySchema).min(3).max(10),
  compatibility_policy: z.literal("exact-minor"),
  experimental: z.literal(true),
  published_at: unixTimestampSchema,
}).strict();

export const receivableCreatedSchema = z.object({
  ...base("ReceivableCreated"),
  receivable_id: opaqueIdSchema,
  title: safePublicTextSchema,
  provider_pseudonym: z.string().trim().min(2).max(60),
  provider_pubkey: hex64Schema,
  nominal_amount_minor: positiveIntegerStringSchema,
  original_currency: currencyCodeSchema,
  due_at: unixTimestampSchema,
  category: z.enum(["SERVICE", "SALARY", "SALE", "COMMISSION", "OTHER"]),
  country: countryCodeSchema,
  private_evidence_hash: hex64Schema,
  receivable_version: z.number().int().positive(),
  created_at: unixTimestampSchema,
}).strict();

export const payerCommitmentProofSchema = z.object({
  ...base("PayerCommitmentProof"),
  proof_id: opaqueIdSchema,
  receivable_event_id: hex64Schema,
  private_confirmation_hash: hex64Schema,
  confirmed_at: unixTimestampSchema,
  terms_version: z.string().min(1).max(80),
  accepts_bitcoin: z.literal(true),
  has_nwc_authorization: z.boolean(),
  originator_pubkey: hex64Schema,
}).strict();

export const clientValidationDecisionSchema = z.object({
  ...base("ClientValidationDecision"),
  decision_id: opaqueIdSchema,
  receivable_event_id: hex64Schema,
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_INFORMATION"]),
  policy_version: z.string().min(1).max(80),
  reason_codes: z.array(z.string().regex(/^[A-Z0-9_]{2,64}$/)).min(1).max(16),
  decided_at: unixTimestampSchema,
  private_report_hash: hex64Schema.optional(),
  client_pubkey: hex64Schema,
}).strict();

export const nwcAuthorizationAttestationSchema = z.object({
  ...base("NwcAuthorizationAttestation"),
  attestation_id: opaqueIdSchema,
  receivable_event_id: hex64Schema,
  authorization_state: z.enum(["ACTIVE", "INVALID", "REVOKED", "EXPIRED"]),
  pay_invoice_supported: z.boolean(),
  max_authorized_msat: positiveIntegerStringSchema,
  due_at: unixTimestampSchema,
  expires_at: unixTimestampSchema,
  single_use: z.literal(true),
  safe_fingerprint: hex64Schema,
  last_validated_at: unixTimestampSchema,
  executor_pubkey: hex64Schema,
}).strict().superRefine((value, context) => {
  if (value.expires_at <= value.last_validated_at || value.expires_at <= value.due_at) {
    context.addIssue({ code: "custom", message: "authorization must outlive validation and due date" });
  }
});

const publicReputationFactSchema = z.object({
  assertion: z.string().regex(/^[a-z0-9_]{3,64}$/),
  event_id: hex64Schema,
}).strict();

export const poolCreatedSchema = z.object({
  ...base("PoolCreated"),
  pool_id: opaqueIdSchema,
  title: safePublicTextSchema,
  provider_pseudonym: z.string().trim().min(2).max(60),
  public_reputation_facts: z.array(publicReputationFactSchema).max(20),
  receivable_event_id: hex64Schema,
  payer_commitment_event_id: hex64Schema,
  approval_event_id: hex64Schema,
  nwc_attestation_event_id: hex64Schema,
  originator_pubkey: hex64Schema,
  original_currency: currencyCodeSchema,
  target_sats: positiveIntegerStringSchema,
  minimum_partial_bps: z.literal(5000),
  funding_deadline: unixTimestampSchema,
  due_at: unixTimestampSchema,
  discount_bps: basisPointsSchema.max(500),
  expected_return_bps: basisPointsSchema,
  client_fees_sats: unsignedIntegerStringSchema,
  fixed_late_fee_bps: z.literal(200),
  daily_late_interest_bps: z.literal(10),
  maximum_penalty_bps: z.literal(1000),
  partial_funding_policy: z.literal("PROVIDER_DECIDES_AT_OR_ABOVE_MINIMUM"),
  partial_acceptance_window_seconds: z.literal(86_400),
  cancellation_policy: z.literal("REFUND_BEFORE_DISBURSEMENT"),
  dispute_policy: z.literal("ORIGINATOR_COORDINATED_V0_1"),
  originator_concentrates_operational_roles: z.literal(true),
  terms_accepted_at: unixTimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.funding_deadline >= value.due_at) {
    context.addIssue({ code: "custom", message: "funding deadline must precede due date" });
  }
});

export const poolStates = [
  "PUBLISHED", "FUNDING", "PARTIALLY_FUNDED", "FULLY_FUNDED",
  "PARTIAL_ACCEPTANCE_PENDING", "PARTIAL_ACCEPTED", "REFUNDING",
  "DISBURSED", "DUE", "PAID_ON_TIME", "PAID_LATE", "OVERDUE",
  "DEFAULTED", "DISPUTED", "SETTLED", "CANCELLED",
] as const;

export const poolTransitionSchema = z.object({
  ...base("PoolTransition"),
  transition_id: opaqueIdSchema,
  pool_event_id: hex64Schema,
  previous_event_id: hex64Schema,
  previous_state: z.enum(poolStates),
  new_state: z.enum(poolStates),
  reason_code: z.string().regex(/^[A-Z0-9_]{2,64}$/),
  actor_pubkey: hex64Schema,
  actor_role: z.enum(["PROVIDER", "ORIGINATOR", "CONTRIBUTOR"]),
  rule_version: z.string().min(1).max(80),
  idempotency_key: z.string().min(16).max(128).regex(/^[A-Za-z0-9:_-]+$/),
  proof_event_ids: z.array(hex64Schema).max(20),
  funded_bps: basisPointsSchema.optional(),
  transitioned_at: unixTimestampSchema,
}).strict().refine((value) => value.previous_state !== value.new_state, "transition must change state");

export const protocolContentSchemas = {
  [PROTOCOL_KINDS.PROTOCOL_DEFINITION]: protocolDefinitionSchema,
  [PROTOCOL_KINDS.RECEIVABLE_CREATED]: receivableCreatedSchema,
  [PROTOCOL_KINDS.PAYER_COMMITMENT_PROOF]: payerCommitmentProofSchema,
  [PROTOCOL_KINDS.CLIENT_VALIDATION_DECISION]: clientValidationDecisionSchema,
  [PROTOCOL_KINDS.NWC_AUTHORIZATION_ATTESTATION]: nwcAuthorizationAttestationSchema,
  [PROTOCOL_KINDS.POOL_CREATED]: poolCreatedSchema,
  [PROTOCOL_KINDS.POOL_TRANSITION]: poolTransitionSchema,
} as const;

export type ProtocolDefinition = z.infer<typeof protocolDefinitionSchema>;
export type ReceivableCreated = z.infer<typeof receivableCreatedSchema>;
export type PayerCommitmentProof = z.infer<typeof payerCommitmentProofSchema>;
export type ClientValidationDecision = z.infer<typeof clientValidationDecisionSchema>;
export type NwcAuthorizationAttestation = z.infer<typeof nwcAuthorizationAttestationSchema>;
export type PoolCreated = z.infer<typeof poolCreatedSchema>;
export type PoolTransition = z.infer<typeof poolTransitionSchema>;
export type PoolState = (typeof poolStates)[number];
export type ProtocolContent = ProtocolDefinition | ReceivableCreated | PayerCommitmentProof | ClientValidationDecision | NwcAuthorizationAttestation | PoolCreated | PoolTransition;
