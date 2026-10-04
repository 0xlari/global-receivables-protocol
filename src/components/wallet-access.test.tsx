import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WalletAccess } from "./wallet-access";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

describe("WalletAccess", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); replace.mockReset(); refresh.mockReset(); });

  it("revokes the current session before allowing a wallet switch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ authenticated: false }), { status: 200 }));
    render(<WalletAccess redirectTo="/painel" forceSwitch />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", { method: "DELETE" }));
    expect(await screen.findByRole("button", { name: /conectar carteira lightning/i })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not issue another login when revoking the previous session fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 503 }));
    render(<WalletAccess redirectTo="/painel" forceSwitch />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível encerrar/i);
    expect(screen.queryByRole("button", { name: /conectar carteira lightning/i })).not.toBeInTheDocument();
  });
});
