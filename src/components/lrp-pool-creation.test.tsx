import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LrpPoolCreation } from "./lrp-pool-creation";

const terms = {
  protocol_version: "lrp/0.1.0", event_type: "PoolCreated", pool_id: "pool_demo_00000001", title: "Pagamento internacional",
  provider_pseudonym: "Criadora 21", public_reputation_facts: [], receivable_event_id: "a".repeat(64), payer_commitment_event_id: "b".repeat(64),
  approval_event_id: "c".repeat(64), nwc_attestation_event_id: "d".repeat(64), originator_pubkey: "e".repeat(64), original_currency: "USD",
  target_sats: "1900000", minimum_partial_bps: 5000, funding_deadline: 1_785_254_400, due_at: 1_787_673_600,
  discount_bps: 300, expected_return_bps: 216, client_fees_sats: "0", fixed_late_fee_bps: 200, daily_late_interest_bps: 10,
  maximum_penalty_bps: 1000, partial_funding_policy: "PROVIDER_DECIDES_AT_OR_ABOVE_MINIMUM", partial_acceptance_window_seconds: 86400,
  cancellation_policy: "REFUND_BEFORE_DISBURSEMENT", dispute_policy: "ORIGINATOR_COORDINATED_V0_1", originator_concentrates_operational_roles: true,
};

const receivableId = "11111111-1111-4111-8111-111111111111";

describe("LrpPoolCreation", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); Reflect.deleteProperty(window, "nostr"); });

  it("mostra botão Revisar termos e criar pool quando não há pool publicada", () => {
    render(<LrpPoolCreation mode="LRP" receivableId={receivableId} />);
    expect(screen.getByRole("button", { name: "Revisar termos e criar pool" })).toBeVisible();
    expect(screen.queryByText("Consultar elegibilidade")).not.toBeInTheDocument();
  });

  it("mostra termos calculados após consultar, sem campos de fórmula", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? new Response(JSON.stringify({ poolOriginationId: crypto.randomUUID(), poolId: terms.pool_id, status: "TERMS_READY", termsHash: "f".repeat(64), terms }), { status: 201 })
      : new Response(JSON.stringify({ receivableId }), { status: 200 })));
    render(<LrpPoolCreation mode="LRP" receivableId={receivableId} />);
    fireEvent.click(screen.getByRole("button", { name: "Revisar termos e criar pool" }));
    expect(await screen.findByText("1900000 sats")).toBeVisible();
    expect(screen.getByText("300 bps · 216 bps")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Li e aceito publicar/ })).toBeVisible();
  });

  it("mostra Pool publicada com quórum 2/3 e Ver pool quando a pool está publicada", () => {
    render(<LrpPoolCreation mode="LRP" receivableId={receivableId} pool={{ poolId: "pool-pub-1", status: "PUBLISHED", canonicalSource: "LRP" }} />);
    expect(screen.getByText("Pool publicada com quórum 2/3.")).toBeVisible();
    const link = screen.getByRole("link", { name: "Ver pool" });
    expect(link).toHaveAttribute("href", "/pools/pool-pub-1");
    expect(screen.queryByRole("button", { name: "Revisar termos e criar pool" })).not.toBeInTheDocument();
  });

  it("usa o poolId real no link Ver pool", () => {
    render(<LrpPoolCreation mode="LRP" receivableId={receivableId} pool={{ poolId: "real-pool-id-xyz", status: "PROJECTION_PENDING", canonicalSource: "LRP" }} />);
    expect(screen.getByRole("link", { name: "Ver pool" })).toHaveAttribute("href", "/pools/real-pool-id-xyz");
  });

  it("mostra Ver pool e Pool publicada com quórum quando recebe pool publicada via prop", () => {
    render(<LrpPoolCreation mode="LRP" receivableId={receivableId} pool={{ poolId: "pool-pub-2", status: "PUBLISHED", canonicalSource: "LRP" }} />);
    expect(screen.getByText("Pool publicada com quórum 2/3.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver pool" })).toHaveAttribute("href", "/pools/pool-pub-2");
  });

  it("bloqueia a publicação quando a identidade do signer difere da sessão", async () => {
    Object.defineProperty(window, "nostr", { configurable: true, value: { getPublicKey: vi.fn().mockResolvedValue("1".repeat(64)), signEvent: vi.fn() } });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/session") return new Response(JSON.stringify({ profile: { nostrPubkey: "2".repeat(64) } }), { status: 200 });
      if (init?.method === "POST") return new Response(JSON.stringify({ poolOriginationId: crypto.randomUUID(), poolId: terms.pool_id, status: "TERMS_READY", termsHash: "f".repeat(64), terms }), { status: 201 });
      return new Response(JSON.stringify({}), { status: 200 });
    }));
    render(<LrpPoolCreation mode="LRP" receivableId={receivableId} />);
    fireEvent.click(screen.getByRole("button", { name: "Revisar termos e criar pool" }));
    const checkbox = await screen.findByRole("checkbox", { name: /Li e aceito publicar/ });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Assinar e publicar pool" }));
    expect(await screen.findByText("A identidade usada não corresponde à sessão atual.")).toBeVisible();
  });
});
