/**
 * Experimental application-specific kinds for LRP event version lrp/0.1.0.
 *
 * These numbers are not an official NIP allocation. Consumers must validate
 * the protocol version and logical event type in addition to the numeric kind.
 */
export const PROTOCOL_KINDS = Object.freeze({
  PROTOCOL_DEFINITION: 8100,
  RECEIVABLE_CREATED: 8101,
  PAYER_COMMITMENT_PROOF: 8102,
  CLIENT_VALIDATION_DECISION: 8103,
  NWC_AUTHORIZATION_ATTESTATION: 8104,
  POOL_CREATED: 8105,
  CONTRIBUTION_INTENT: 8106,
  CONTRIBUTION_FUNDED: 8107,
  POOL_TRANSITION: 8108,
  ORACLE_ATTESTATION: 8109,
  REPAYMENT_SETTLEMENT: 8110,
  DISTRIBUTION_RECEIPT: 8111,
  REPUTATION_FACT: 8112,
  POOL_REFERRAL: 8113,
  DISPUTE_EVENT: 8114,
} as const);

export type ProtocolKindName = keyof typeof PROTOCOL_KINDS;
export type ProtocolKind = (typeof PROTOCOL_KINDS)[ProtocolKindName];

export const V0_1_IMPLEMENTED_KIND_NAMES = Object.freeze([
  "PROTOCOL_DEFINITION",
  "RECEIVABLE_CREATED",
  "PAYER_COMMITMENT_PROOF",
  "CLIENT_VALIDATION_DECISION",
  "NWC_AUTHORIZATION_ATTESTATION",
  "POOL_CREATED",
  "POOL_TRANSITION",
] as const satisfies readonly ProtocolKindName[]);

export const V0_1_RESERVED_KIND_NAMES = Object.freeze([
  "CONTRIBUTION_INTENT",
  "CONTRIBUTION_FUNDED",
  "ORACLE_ATTESTATION",
  "REPAYMENT_SETTLEMENT",
  "DISTRIBUTION_RECEIPT",
  "REPUTATION_FACT",
  "POOL_REFERRAL",
  "DISPUTE_EVENT",
] as const satisfies readonly ProtocolKindName[]);
