import { beforeEach, describe, expect, it } from "vitest";

import { createDemoReceivable, getDemoPlatformState, getDemoState, resetDemoState } from "@/lib/demo-store";

const receivable = (description: string) => ({
  purpose: "SERVICE" as const,
  description,
  amountUsd: 100,
  dueDate: "2026-08-30",
  payerName: "Pagador fictício",
  payerCountry: "US",
  evidenceName: "evidencia.pdf",
});

describe("demo store scoped by wallet profile", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps receivables isolated between different wallet profiles", () => {
    createDemoReceivable("profile-a", receivable("Recebível A"));
    createDemoReceivable("profile-b", receivable("Recebível B"));

    expect(getDemoState("profile-a").receivables.map((item) => item.description)).toEqual(["Recebível A"]);
    expect(getDemoState("profile-b").receivables.map((item) => item.description)).toEqual(["Recebível B"]);
    expect(getDemoPlatformState().receivables).toHaveLength(2);
  });

  it("restores the same profile without exposing another profile history", () => {
    createDemoReceivable("profile-a", receivable("Histórico persistente"));
    expect(getDemoState("profile-a").receivables[0]?.description).toBe("Histórico persistente");
    expect(getDemoState("profile-b").receivables).toEqual([]);
    resetDemoState("profile-a");
    expect(getDemoState("profile-a").receivables).toEqual([]);
  });
});
