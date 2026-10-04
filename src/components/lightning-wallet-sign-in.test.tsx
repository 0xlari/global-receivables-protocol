import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LightningWalletSignIn } from "./lightning-wallet-sign-in";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

describe("Lightning wallet sign in", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); replace.mockReset(); refresh.mockReset(); });

  it("creates and displays a private LNURL-auth challenge", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ challengeId: "00000000-0000-4000-8000-000000000001", pollToken: "a".repeat(43), lnurl: "lnurl1example", qrDataUrl: "data:image/png;base64,AA==", expiresAt: "2026-07-16T12:05:00.000Z", publicHttps: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    render(<LightningWalletSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /conectar carteira lightning/i }));
    expect(await screen.findByAltText(/qr code para entrar/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir na carteira/i })).toHaveAttribute("href", "lightning:lnurl1example");
    expect(fetch).toHaveBeenCalledWith("/api/auth/lnurl/challenge", { method: "POST" });
  });

  it("shows a safe error without falling back to email or Nostr", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 503 }));
    render(<LightningWalletSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /conectar carteira lightning/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/não foi possível criar/i));
    expect(screen.queryByLabelText(/e-mail/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nostr/i)).not.toBeInTheDocument();
  });
});
