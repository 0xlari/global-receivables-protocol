import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeSigner } from "@nostr/signer";
import type { ProtocolUnsignedEvent } from "@protocol/schemas";
import { ProtocolReceivableFlow } from "./protocol-receivable-flow";

describe("ProtocolReceivableFlow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "nostr");
  });

  it("links a NIP-07 signer and publishes a signed receivable", async () => {
    const fake = new FakeSigner(new Uint8Array(32).fill(41)); const pubkey = await fake.getPublicKey();
    Object.defineProperty(window, "nostr", { configurable: true, value: { getPublicKey: () => fake.getPublicKey(), signEvent: (event: ProtocolUnsignedEvent) => fake.signEvent(event) } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return new Response(JSON.stringify({ authenticated: true, profile: { id: "profile", label: "Perfil teste", nostrPubkey: null } }), { status: 200 });
      if (url === "/api/protocol/identity/challenge") return new Response(JSON.stringify({ challengeId: "11111111-1111-4111-8111-111111111111", event: { kind: 27235, created_at: 1_800_000_000, tags: [["u", "http://localhost/api/protocol/identity/complete"], ["method", "POST"]], content: "" } }), { status: 200 });
      if (url === "/api/protocol/identity/complete") return new Response(JSON.stringify({ linked: true, pubkey }), { status: 200 });
      if (url === "/api/protocol/events") return new Response(JSON.stringify({ status: "CONFIRMED", acknowledgedRelays: ["wss://one.example/", "wss://two.example/"] }), { status: 201 });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProtocolReceivableFlow />);
    await screen.findByText(/Protocolo experimental v0.1/);
    fireEvent.click(screen.getByRole("button", { name: "Conectar signer" }));
    await screen.findByText(/Signer vinculado/);
    fireEvent.change(screen.getByLabelText("Vencimento"), { target: { value: "2027-01-20" } });
    const file = new File([new Uint8Array([1, 2, 3])], "evidencia.pdf", { type: "application/pdf" });
    if (!(file as File & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer) Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1, 2, 3]).buffer });
    fireEvent.change(screen.getByLabelText("Evidência privada"), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: "Assinar e publicar recebível" }).closest("form")!);
    await screen.findByText("Recebível publicado");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/protocol/events", expect.objectContaining({ method: "POST" })));
  });
});
