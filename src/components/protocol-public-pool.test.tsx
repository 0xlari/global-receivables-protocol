import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProtocolPublicPool } from "./protocol-public-pool";

describe("ProtocolPublicPool", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renderiza projeção reconstruída e provas dos relays", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ pool: { state: "PUBLISHED", terms: { title: "Venda internacional", provider_pseudonym: "Ada", target_sats: "100000", original_currency: "USD", due_at: 1785000000, expected_return_bps: 350, discount_bps: 500, originator_pubkey: "b".repeat(64), public_reputation_facts: [] } }, progressBps: 0, events: [{ id: "a".repeat(64), kind: 8105, pubkey: "c".repeat(64), sig: "d".repeat(128), observedOn: ["wss://one.example/"] }], rejected: [], unavailableRelays: [] }))));
    render(<ProtocolPublicPool poolEventId={"a".repeat(64)} />);
    expect(await screen.findByText("Venda internacional")).toBeInTheDocument(); expect(screen.getByText(/Reconstruída do Nostr/)).toBeInTheDocument(); expect(screen.getByText(/wss:\/\/one.example/)).toBeInTheDocument();
  });
});
