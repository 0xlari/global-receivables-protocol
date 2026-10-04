import { describe, expect, it } from "vitest";

import {
  contributionTransitions,
  poolTransitions,
  receivableTransitions,
  transition,
  validationTransitions,
} from "./state-machine";

describe("domain state machines", () => {
  it("allows the approved receivable path", () => {
    expect(transition("DRAFT", "AWAITING_CLIENT", receivableTransitions)).toBe(
      "AWAITING_CLIENT",
    );
    expect(
      transition("UNDER_VALIDATION", "APPROVED", receivableTransitions),
    ).toBe("APPROVED");
  });

  it("does not let an unapproved receivable become pooled", () => {
    expect(() =>
      transition("UNDER_VALIDATION", "POOLED", receivableTransitions),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
  });

  it("forces a partial pool to choose acceptance or refund", () => {
    expect(
      transition("PARTIAL_EXPIRED", "ACCEPTED_PARTIAL", poolTransitions),
    ).toBe("ACCEPTED_PARTIAL");
    expect(transition("PARTIAL_EXPIRED", "REFUNDING", poolTransitions)).toBe(
      "REFUNDING",
    );
    expect(() =>
      transition("REFUNDING", "ACCEPTED_PARTIAL", poolTransitions),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
  });

  it("does not allocate an unpaid contribution", () => {
    expect(() =>
      transition("PENDING", "ALLOCATED", contributionTransitions),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
  });

  it("only allows an exceptional review from a running validation", () => {
    expect(transition("RUNNING", "NEEDS_REVIEW", validationTransitions)).toBe(
      "NEEDS_REVIEW",
    );
    expect(() =>
      transition("PENDING", "PASSED", validationTransitions),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
  });
});
