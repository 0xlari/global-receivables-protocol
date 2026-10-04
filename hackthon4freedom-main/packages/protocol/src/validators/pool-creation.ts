import type { PoolCreated, ProtocolSignedEvent } from "../schemas";
import { validateProtocolEvent, type ValidatedProtocolEvent } from "./event";

export type PoolPrerequisiteValidation = Readonly<{ valid: true; pool: ValidatedProtocolEvent }> | Readonly<{ valid: false; reason: string }>;

export function validatePoolCreationGraph(poolInput: ProtocolSignedEvent, graphInputs: readonly ProtocolSignedEvent[]): PoolPrerequisiteValidation {
  const poolResult = validateProtocolEvent(poolInput);
  if (!poolResult.valid || poolResult.value.content.event_type !== "PoolCreated") return { valid: false, reason: poolResult.valid ? "NOT_POOL_CREATED" : poolResult.reason };
  const pool = poolResult.value;
  const terms = pool.content as PoolCreated;
  const graph = new Map<string, ValidatedProtocolEvent>();
  for (const input of graphInputs) {
    const result = validateProtocolEvent(input);
    if (result.valid) graph.set(result.value.event.id, result.value);
  }
  const receivable = graph.get(terms.receivable_event_id);
  const commitment = graph.get(terms.payer_commitment_event_id);
  const approval = graph.get(terms.approval_event_id);
  const nwc = graph.get(terms.nwc_attestation_event_id);
  if (!receivable || receivable.content.event_type !== "ReceivableCreated") return { valid: false, reason: "RECEIVABLE_REQUIRED" };
  if (!commitment || commitment.content.event_type !== "PayerCommitmentProof") return { valid: false, reason: "PAYER_COMMITMENT_REQUIRED" };
  if (!approval || approval.content.event_type !== "ClientValidationDecision" || approval.content.decision !== "APPROVED") return { valid: false, reason: "CLIENT_APPROVAL_REQUIRED" };
  if (!nwc || nwc.content.event_type !== "NwcAuthorizationAttestation") return { valid: false, reason: "PAYER_NWC_COMMITMENT_REQUIRED" };
  if (nwc.content.authorization_state !== "ACTIVE" || !nwc.content.pay_invoice_supported) return { valid: false, reason: "ACTIVE_NWC_ATTESTATION_REQUIRED" };
  if (pool.event.pubkey !== receivable.event.pubkey) return { valid: false, reason: "POOL_PROVIDER_MISMATCH" };
  if (commitment.content.receivable_event_id !== receivable.event.id || approval.content.receivable_event_id !== receivable.event.id || nwc.content.receivable_event_id !== receivable.event.id) return { valid: false, reason: "RECEIVABLE_REFERENCE_MISMATCH" };
  if (commitment.content.originator_pubkey !== terms.originator_pubkey || approval.event.pubkey !== terms.originator_pubkey || approval.content.client_pubkey !== terms.originator_pubkey || nwc.event.pubkey !== terms.originator_pubkey || nwc.content.executor_pubkey !== terms.originator_pubkey) return { valid: false, reason: "ORIGINATOR_AUTHORITY_MISMATCH" };
  if (nwc.content.expires_at <= terms.due_at) return { valid: false, reason: "NWC_EXPIRES_BEFORE_POOL_DUE" };
  return { valid: true, pool };
}
