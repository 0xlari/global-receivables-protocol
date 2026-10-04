import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ReceivablePage from "./page";

describe("página do recebível", () => {
  it("oferece o cadastro demonstrativo somente após autenticação", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    render(<ReceivablePage />);
    expect(screen.getByRole("heading", { name: /cadastre o pagamento/i })).toBeInTheDocument();
    expect(screen.getByText(/somente um recebível ativo por vez/i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /entrar com nostr/i })).toHaveAttribute("href", "/entrar?next=/recebivel");
  });
});
