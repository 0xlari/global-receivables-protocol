import { describe, expect, it } from "vitest";

import {
  assertPaymentAttemptAllowed,
  safeNwcFailureReason,
  transitionPayerPaymentAuthorization,
} from "./payer-payment";

const due = new Date("2026-08-30T12:00:00.000Z");
const expiry = new Date("2026-09-01T12:00:00.000Z");

describe("payer payment authorization", () => {
  it("allows one in-limit attempt after the due date", () => {
    expect(() => assertPaymentAttemptAllowed({
      amountMsat: 500_000n,
      maxAmountMsat: 500_000n,
      now: due,
      scheduledFor: due,
      expiresAt: expiry,
      status: "ACTIVE",
    })).not.toThrow();
  });

  it.each([
    ["before due", { now: new Date("2026-08-29T12:00:00.000Z") }],
    ["above limit", { amountMsat: 500_001n }],
    ["expired", { now: expiry }],
    ["revoked", { status: "REVOKED" as const, revokedAt: due }],
    ["already used", { status: "PAID" as const, usedAt: due }],
  ])("rejects %s", (_label, overrides) => {
    expect(() => assertPaymentAttemptAllowed({
      amountMsat: 500_000n,
      maxAmountMsat: 500_000n,
      now: due,
      scheduledFor: due,
      expiresAt: expiry,
      status: "ACTIVE",
      ...overrides,
    })).toThrow();
  });

  it("does not allow a second terminal transition", () => {
    expect(transitionPayerPaymentAuthorization("PAYMENT_PENDING", "PAID")).toBe("PAID");
    expect(() => transitionPayerPaymentAuthorization("PAID", "PAYMENT_PENDING")).toThrow();
  });

  it("maps failures without exposing provider details", () => {
    expect(safeNwcFailureReason("UNAUTHORIZED")).toContain("não está mais autorizada");
  });
});
