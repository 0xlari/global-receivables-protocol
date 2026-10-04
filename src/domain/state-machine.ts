import { DomainError } from "./errors";

type TransitionMap<State extends string> = Readonly<
  Record<State, readonly State[]>
>;

export function transition<State extends string>(
  current: State,
  next: State,
  allowed: TransitionMap<State>,
): State {
  if (!allowed[current].includes(next)) {
    throw new DomainError(
      `Transição inválida: ${current} -> ${next}.`,
      "INVALID_STATE_TRANSITION",
    );
  }

  return next;
}

export const receivableStatuses = [
  "DRAFT",
  "AWAITING_CLIENT",
  "UNDER_VALIDATION",
  "NEEDS_CORRECTION",
  "REJECTED",
  "APPROVED",
  "POOLED",
  "ADVANCED",
  "DUE",
  "PAID",
  "DEFAULTED",
  "CLOSED",
] as const;

export type ReceivableStatus = (typeof receivableStatuses)[number];

export const receivableTransitions: TransitionMap<ReceivableStatus> = {
  DRAFT: ["AWAITING_CLIENT"],
  AWAITING_CLIENT: ["UNDER_VALIDATION", "REJECTED"],
  UNDER_VALIDATION: ["NEEDS_CORRECTION", "REJECTED", "APPROVED"],
  NEEDS_CORRECTION: ["AWAITING_CLIENT", "REJECTED"],
  REJECTED: [],
  APPROVED: ["POOLED"],
  POOLED: ["ADVANCED"],
  ADVANCED: ["DUE"],
  DUE: ["PAID", "DEFAULTED"],
  PAID: ["CLOSED"],
  DEFAULTED: ["PAID", "CLOSED"],
  CLOSED: [],
};

export const poolStatuses = [
  "DRAFT",
  "OPEN",
  "FULL",
  "PARTIAL_EXPIRED",
  "CANCELLED",
  "ACCEPTED_PARTIAL",
  "REFUNDING",
  "DISBURSING",
  "FUNDED",
  "SETTLING",
  "SETTLED",
  "COVERED",
  "DISPUTED",
] as const;

export type PoolStatus = (typeof poolStatuses)[number];

export const poolTransitions: TransitionMap<PoolStatus> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["FULL", "PARTIAL_EXPIRED", "CANCELLED"],
  FULL: ["DISBURSING"],
  PARTIAL_EXPIRED: ["ACCEPTED_PARTIAL", "REFUNDING"],
  CANCELLED: [],
  ACCEPTED_PARTIAL: ["DISBURSING"],
  REFUNDING: ["CANCELLED"],
  DISBURSING: ["FUNDED", "DISPUTED"],
  FUNDED: ["SETTLING", "DISPUTED"],
  SETTLING: ["SETTLED", "COVERED", "DISPUTED"],
  SETTLED: [],
  COVERED: ["SETTLED", "DISPUTED"],
  DISPUTED: ["SETTLING", "CANCELLED"],
};

export const contributionStatuses = [
  "CREATED",
  "INVOICE_ISSUED",
  "PENDING",
  "SETTLED",
  "EXPIRED",
  "FAILED",
  "ALLOCATED",
  "DISTRIBUTED",
  "REFUND_PENDING",
  "REFUNDED",
] as const;

export type ContributionStatus = (typeof contributionStatuses)[number];

export const contributionTransitions: TransitionMap<ContributionStatus> = {
  CREATED: ["INVOICE_ISSUED", "FAILED"],
  INVOICE_ISSUED: ["PENDING", "EXPIRED", "FAILED"],
  PENDING: ["SETTLED", "EXPIRED", "FAILED"],
  SETTLED: ["ALLOCATED", "REFUND_PENDING"],
  EXPIRED: [],
  FAILED: [],
  ALLOCATED: ["DISTRIBUTED", "REFUND_PENDING"],
  DISTRIBUTED: [],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
};

export const validationStatuses = [
  "PENDING",
  "RUNNING",
  "NEEDS_REVIEW",
  "PASSED",
  "FAILED",
] as const;

export type ValidationStatus = (typeof validationStatuses)[number];

export const validationTransitions: TransitionMap<ValidationStatus> = {
  PENDING: ["RUNNING"],
  RUNNING: ["NEEDS_REVIEW", "PASSED", "FAILED"],
  NEEDS_REVIEW: ["PASSED", "FAILED"],
  PASSED: [],
  FAILED: [],
};
