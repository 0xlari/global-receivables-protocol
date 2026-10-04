import type { PoolCreated, PoolTransition } from "../schemas";

const providerStates = new Set<PoolTransition["new_state"]>([
  "FUNDING", "PARTIAL_ACCEPTED", "REFUNDING", "CANCELLED", "DISPUTED",
]);
const originatorStates = new Set<PoolTransition["new_state"]>([
  "PARTIALLY_FUNDED", "FULLY_FUNDED", "PARTIAL_ACCEPTANCE_PENDING", "REFUNDING",
  "DISBURSED", "DUE", "PAID_ON_TIME", "PAID_LATE", "OVERDUE", "DEFAULTED",
  "DISPUTED", "SETTLED", "CANCELLED",
]);
const contributorStates = new Set<PoolTransition["new_state"]>(["DISPUTED"]);

export function validateTransitionAuthority(pool: PoolCreated, transition: PoolTransition, providerPubkey: string) {
  if (transition.actor_role === "PROVIDER") {
    if (transition.actor_pubkey !== providerPubkey || !providerStates.has(transition.new_state)) return { valid: false as const, reason: "PROVIDER_NOT_AUTHORIZED" };
    return { valid: true as const };
  }
  if (transition.actor_role === "ORIGINATOR") {
    if (transition.actor_pubkey !== pool.originator_pubkey || !originatorStates.has(transition.new_state)) return { valid: false as const, reason: "ORIGINATOR_NOT_AUTHORIZED" };
    return { valid: true as const };
  }
  if (!contributorStates.has(transition.new_state)) return { valid: false as const, reason: "CONTRIBUTOR_NOT_AUTHORIZED" };
  return { valid: true as const };
}
