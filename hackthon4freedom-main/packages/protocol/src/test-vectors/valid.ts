import { PROTOCOL_KINDS } from "../kinds";
import { LRP_EVENT_VERSION, LRP_NAME } from "../version";
import type { ProtocolContent } from "../schemas";

export const TEST_PUBKEYS = {
  provider: "1".repeat(64),
  originator: "2".repeat(64),
  maintainer: "3".repeat(64),
  contributor: "4".repeat(64),
} as const;

export const TEST_EVENT_IDS = {
  receivable: "a".repeat(64),
  commitment: "b".repeat(64),
  approval: "c".repeat(64),
  nwc: "d".repeat(64),
  pool: "e".repeat(64),
  transition: "f".repeat(64),
} as const;

const baseTime = 1_800_000_000;

export const validContentVectors: ReadonlyArray<Readonly<{ kind: number; content: ProtocolContent }>> = [
  { kind: PROTOCOL_KINDS.PROTOCOL_DEFINITION, content: { protocol_version: LRP_EVENT_VERSION, event_type: "ProtocolDefinition", definition_id: "lrp_definition_v01", name: LRP_NAME, supported_kinds: Object.entries(PROTOCOL_KINDS).map(([name, kind]) => ({ name, kind })), specification_hash: "0".repeat(64), recommended_relays: ["wss://relay.damus.io/", "wss://nos.lol/", "wss://relay.primal.net/", "wss://relay.nostr.band/", "wss://offchain.pub/"], compatibility_policy: "exact-minor", experimental: true, published_at: baseTime } },
  { kind: PROTOCOL_KINDS.RECEIVABLE_CREATED, content: { protocol_version: LRP_EVENT_VERSION, event_type: "ReceivableCreated", receivable_id: "receivable_demo_0001", title: "Pagamento internacional de design", provider_pseudonym: "Criadora 21", provider_pubkey: TEST_PUBKEYS.provider, nominal_amount_minor: "200000", original_currency: "USD", due_at: baseTime + 2_592_000, category: "SERVICE", country: "BR", private_evidence_hash: "5".repeat(64), receivable_version: 1, created_at: baseTime } },
  { kind: PROTOCOL_KINDS.PAYER_COMMITMENT_PROOF, content: { protocol_version: LRP_EVENT_VERSION, event_type: "PayerCommitmentProof", proof_id: "payer_proof_demo_0001", receivable_event_id: TEST_EVENT_IDS.receivable, private_confirmation_hash: "6".repeat(64), confirmed_at: baseTime + 60, terms_version: "receivable-btc-v2", accepts_bitcoin: true, has_nwc_authorization: true, originator_pubkey: TEST_PUBKEYS.originator } },
  { kind: PROTOCOL_KINDS.CLIENT_VALIDATION_DECISION, content: { protocol_version: LRP_EVENT_VERSION, event_type: "ClientValidationDecision", decision_id: "decision_demo_0001", receivable_event_id: TEST_EVENT_IDS.receivable, decision: "APPROVED", policy_version: "originator-policy-v1", reason_codes: ["EVIDENCE_VERIFIED", "LIMIT_AVAILABLE"], decided_at: baseTime + 120, private_report_hash: "7".repeat(64), client_pubkey: TEST_PUBKEYS.originator } },
  { kind: PROTOCOL_KINDS.NWC_AUTHORIZATION_ATTESTATION, content: { protocol_version: LRP_EVENT_VERSION, event_type: "NwcAuthorizationAttestation", attestation_id: "nwc_attestation_0001", receivable_event_id: TEST_EVENT_IDS.receivable, authorization_state: "ACTIVE", pay_invoice_supported: true, max_authorized_msat: "100000000", due_at: baseTime + 2_592_000, expires_at: baseTime + 2_678_400, single_use: true, safe_fingerprint: "8".repeat(64), last_validated_at: baseTime + 180, executor_pubkey: TEST_PUBKEYS.originator } },
  { kind: PROTOCOL_KINDS.POOL_CREATED, content: { protocol_version: LRP_EVENT_VERSION, event_type: "PoolCreated", pool_id: "pool_demo_00000001", title: "Pagamento internacional de design", provider_pseudonym: "Criadora 21", public_reputation_facts: [], receivable_event_id: TEST_EVENT_IDS.receivable, payer_commitment_event_id: TEST_EVENT_IDS.commitment, approval_event_id: TEST_EVENT_IDS.approval, nwc_attestation_event_id: TEST_EVENT_IDS.nwc, originator_pubkey: TEST_PUBKEYS.originator, original_currency: "USD", target_sats: "950000", minimum_partial_bps: 5000, funding_deadline: baseTime + 604_800, due_at: baseTime + 2_592_000, discount_bps: 500, expected_return_bps: 350, client_fees_sats: "1000", fixed_late_fee_bps: 200, daily_late_interest_bps: 10, maximum_penalty_bps: 1000, partial_funding_policy: "PROVIDER_DECIDES_AT_OR_ABOVE_MINIMUM", partial_acceptance_window_seconds: 86_400, cancellation_policy: "REFUND_BEFORE_DISBURSEMENT", dispute_policy: "ORIGINATOR_COORDINATED_V0_1", originator_concentrates_operational_roles: true, terms_accepted_at: baseTime + 240 } },
  { kind: PROTOCOL_KINDS.POOL_TRANSITION, content: { protocol_version: LRP_EVENT_VERSION, event_type: "PoolTransition", transition_id: "transition_demo_001", pool_event_id: TEST_EVENT_IDS.pool, previous_event_id: TEST_EVENT_IDS.pool, previous_state: "PUBLISHED", new_state: "FUNDING", reason_code: "FUNDING_OPENED", actor_pubkey: TEST_PUBKEYS.provider, actor_role: "PROVIDER", rule_version: "lrp-pool-state/0.1", idempotency_key: "pool_demo_00000001:funding", proof_event_ids: [], funded_bps: 0, transitioned_at: baseTime + 300 } },
];
