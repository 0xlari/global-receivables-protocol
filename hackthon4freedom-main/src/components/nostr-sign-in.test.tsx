import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNostrChallenge } from "@/domain/nostr-auth";
import { NostrSignIn } from "./nostr-sign-in";

const replace = vi.fn();
const refresh = vi.fn();
const router = { replace, refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("NostrSignIn", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    replace.mockReset();
    refresh.mockReset();
    Reflect.deleteProperty(window, "nostr");
  });

  it("shows a safe setup state without window.nostr and never asks for nsec", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    render(<NostrSignIn redirectTo="/painel" />);
    expect(await screen.findByRole("heading", { name: "Conecte uma identidade Nostr" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    expect(document.body).not.toHaveTextContent(/nsec|LNURL|QR/i);
  });

  it("signs a one-use challenge, completes login and redirects", async () => {
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    const challenge = createNostrChallenge(pubkey, "http://localhost/api/auth/nostr/complete", new Date(), "LOGIN");
    Object.defineProperty(window, "nostr", { configurable: true, value: {
      getPublicKey: vi.fn().mockResolvedValue(pubkey),
      signEvent: vi.fn(async (event) => finalizeEvent(event, secret)),
    } });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ challengeId: challenge.id, event: challenge.event }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true }), { status: 200 }));
    render(<NostrSignIn redirectTo="/painel" />);
    fireEvent.click(await screen.findByRole("button", { name: "Entrar com Nostr" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/painel"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/nostr/challenge", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/nostr/complete", expect.objectContaining({ method: "POST" }));
  });

  it("translates permission refusal without exposing internal codes", async () => {
    Object.defineProperty(window, "nostr", { configurable: true, value: { getPublicKey: vi.fn().mockRejectedValue(new Error("denied")), signEvent: vi.fn() } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    render(<NostrSignIn redirectTo="/painel" />);
    fireEvent.click(await screen.findByRole("button", { name: "Entrar com Nostr" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A autorização foi cancelada no seu assinador.");
    expect(document.body).not.toHaveTextContent("NIP07_PROVIDER_NOT_AVAILABLE");
  });
});
