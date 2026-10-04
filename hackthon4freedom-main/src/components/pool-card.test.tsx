import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PoolCard } from "@/components/pool-card";

describe("PoolCard", () => {
  it("exposes funding progress to assistive technology", () => {
    render(
      <PoolCard
        pool={{ id: "p_test", title: "Projeto", amount: "1.000 sats", targetSats: 1_000, fundedSats: 720, funded: 72, due: "amanhã", fundingDeadline: "hoje", discount: "3%", discountBps: 300, coverage: 40, reputation: "Verificada" }}
      />,
    );

    expect(screen.getByRole("progressbar", { name: "72% financiado" })).toHaveAttribute(
      "aria-valuenow",
      "72",
    );
    expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute("href", expect.stringContaining("wa.me"));
  });
});
