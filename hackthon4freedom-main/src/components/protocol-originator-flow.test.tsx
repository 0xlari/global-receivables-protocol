import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

import { ProtocolOriginatorFlow } from "./protocol-originator-flow";

const eventId = "a".repeat(64); const secretKey = generateSecretKey(); const pubkey = getPublicKey(secretKey);
describe("ProtocolOriginatorFlow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "nostr");
  });

  beforeEach(() => {
    Object.defineProperty(window, "nostr", { configurable: true, value: { getPublicKey: vi.fn().mockResolvedValue(pubkey), signEvent: vi.fn(async (event) => finalizeEvent(event, secretKey)) } });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/protocol/events?")) return new Response(JSON.stringify({ events: [{ id: eventId, pubkey: "d".repeat(64), sig: "e".repeat(128), kind: 8101, created_at: 1, tags: [], content: JSON.stringify({ event_type: "ReceivableCreated", title: "Projeto", provider_pseudonym: "Ada", original_currency: "USD", nominal_amount_minor: "10000", due_at: Math.floor(Date.now()/1000)+86400 }) }] }));
      if (url.endsWith("/challenge")) return new Response(JSON.stringify({ challengeId: "id", event: { kind: 27235, created_at: 1, tags: [], content: "x" } }));
      if (url.endsWith("/complete")) return new Response("{}", { status: 200 });
      if (url === "/api/protocol/nwc" && String(init?.body).includes("prepare")) return new Response(JSON.stringify({ maxAmountMsat: "100000000", dueAt: new Date(Date.now()+86400000), expiresAt: new Date(Date.now()+172800000), safeFingerprint: "f".repeat(64), lastValidatedAt: new Date() }), { status: 201 });
      return new Response(JSON.stringify({ status: "CONFIRMED", acknowledgedRelays: ["one", "two"] }), { status: 201 });
    }));
  });
  it("publica compromisso, decisão e atestado sem expor URI nos eventos", async () => {
    render(<ProtocolOriginatorFlow receivableEventId={eventId} />); await screen.findByText("Projeto");
    fireEvent.click(screen.getByRole("button", { name: /Conectar signer/ })); await screen.findByText(/vinculada/);
    fireEvent.change(screen.getByPlaceholderText("nostr+walletconnect://…"), { target: { value: `nostr+walletconnect://${"1".repeat(64)}?relay=wss%3A%2F%2Frelay.example.com&secret=${"2".repeat(64)}` } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar, assinar/ })); await screen.findByText(/confirmados por pelo menos dois relays/);
    const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/protocol/events"); expect(calls).toHaveLength(3);
    for (const [, init] of calls) expect(String(init?.body)).not.toContain("nostr+walletconnect");
    const commitment = JSON.parse(String(calls[0]?.[1]?.body)) as { content: string };
    expect(JSON.parse(commitment.content)).toMatchObject({ protocol_version: "lrp/0.1.0", terms_version: "lrp-originator/0.1" });
  });
});
