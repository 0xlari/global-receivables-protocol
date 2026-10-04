import type { PoolCreated, PoolState, PoolTransition } from "../schemas";
import { validateTransitionAuthority } from "../authorities";

const transitions: Readonly<Record<PoolState, readonly PoolState[]>> = {
  PUBLISHED: ["FUNDING", "CANCELLED"],
  FUNDING: ["PARTIALLY_FUNDED", "FULLY_FUNDED", "REFUNDING", "CANCELLED"],
  PARTIALLY_FUNDED: ["PARTIAL_ACCEPTANCE_PENDING", "FULLY_FUNDED", "REFUNDING"],
  FULLY_FUNDED: ["DISBURSED", "DISPUTED"],
  PARTIAL_ACCEPTANCE_PENDING: ["PARTIAL_ACCEPTED", "REFUNDING", "DISPUTED"],
  PARTIAL_ACCEPTED: ["DISBURSED", "REFUNDING", "DISPUTED"],
  REFUNDING: ["CANCELLED", "SETTLED", "DISPUTED"],
  DISBURSED: ["DUE", "DISPUTED"],
  DUE: ["PAID_ON_TIME", "PAID_LATE", "OVERDUE", "DISPUTED"],
  PAID_ON_TIME: ["SETTLED", "DISPUTED"],
  PAID_LATE: ["SETTLED", "DISPUTED"],
  OVERDUE: ["PAID_LATE", "DEFAULTED", "DISPUTED"],
  DEFAULTED: ["PAID_LATE", "SETTLED", "DISPUTED"],
  DISPUTED: ["SETTLED", "REFUNDING"],
  SETTLED: [],
  CANCELLED: [],
};

export type TransitionContext = Readonly<{
  pool: PoolCreated;
  providerPubkey: string;
  previousTransitionAt?: number;
}>;

export function validateTransition(previousState: PoolState, transition: PoolTransition, context: TransitionContext) {
  if (transition.previous_state !== previousState) return { valid: false as const, reason: "PREVIOUS_STATE_MISMATCH" };
  if (!transitions[previousState].includes(transition.new_state)) return { valid: false as const, reason: "IMPOSSIBLE_STATE_TRANSITION" };
  const authority = validateTransitionAuthority(context.pool, transition, context.providerPubkey);
  if (!authority.valid) return authority;
  const funded = transition.funded_bps;
  if (transition.new_state === "PARTIALLY_FUNDED" && (funded === undefined || funded <= 0 || funded >= 10_000)) return { valid: false as const, reason: "INVALID_PARTIAL_FUNDING" };
  if (transition.new_state === "FULLY_FUNDED" && funded !== 10_000) return { valid: false as const, reason: "FULL_FUNDING_REQUIRES_100_PERCENT" };
  if (["PARTIAL_ACCEPTANCE_PENDING", "PARTIAL_ACCEPTED"].includes(transition.new_state) && (funded === undefined || funded < context.pool.minimum_partial_bps || funded >= 10_000)) return { valid: false as const, reason: "PARTIAL_MINIMUM_NOT_MET" };
  if (transition.new_state === "PARTIAL_ACCEPTANCE_PENDING" && transition.transitioned_at < context.pool.funding_deadline) return { valid: false as const, reason: "PARTIAL_WINDOW_BEFORE_DEADLINE" };
  if (transition.new_state === "PARTIAL_ACCEPTED" && context.previousTransitionAt !== undefined && transition.transitioned_at > context.previousTransitionAt + context.pool.partial_acceptance_window_seconds) return { valid: false as const, reason: "PARTIAL_ACCEPTANCE_WINDOW_EXPIRED" };
  if (transition.new_state === "CANCELLED" && previousState !== "PUBLISHED" && previousState !== "FUNDING" && previousState !== "REFUNDING") return { valid: false as const, reason: "CANCELLATION_AFTER_DISBURSEMENT_FORBIDDEN" };
  return { valid: true as const };
}

export function calculateLatePenaltyBps(daysLate: number) {
  if (!Number.isInteger(daysLate) || daysLate < 0) throw new Error("INVALID_DAYS_LATE");
  if (daysLate === 0) return 0;
  return Math.min(1_000, 200 + daysLate * 10);
}
