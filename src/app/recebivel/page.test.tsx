import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ReceivablePage from "./page";

describe("página do recebível", () => {
  it("oferece o cadastro GRP somente após autenticação", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    render(<ReceivablePage />);
    expect(screen.getByRole("heading", { name: /cadastre o pagamento/i })).toBeInTheDocument();
    expect(screen.getByText(/dados privados permanecem fora da blockchain/i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /entrar com carteira solana/i })).toHaveAttribute("href", "/entrar?next=/recebivel");
  });
});
