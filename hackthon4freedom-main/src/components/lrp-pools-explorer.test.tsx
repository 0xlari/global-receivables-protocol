import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LrpPoolPublicView } from "@/services/lrp-pool-read-service";
import { LrpPoolDetailsView } from "./lrp-pool-details";
import { LrpPoolsExplorer } from "./lrp-pools-explorer";
import { PoolsExplorer } from "./pools-explorer";
import { publicPools } from "@/data/public-pools";

const pool: LrpPoolPublicView = {
  source: "LRP", poolId: "pool_public_01", eventId: "a".repeat(64), title: "Venda internacional",
  providerPseudonym: "Criadora 21", publicReputation: ["identity_verified"], targetSats: "950000",
  originalCurrency: "USD", dueAt: 1_802_592_000, discountBps: 500, expectedReturnBps: 350,
  minimumPartialBps: 5000, fundingDeadline: 1_800_604_800, fixedLateFeeBps: 200,
  dailyLateInterestBps: 10, maximumPenaltyBps: 1000, originatorPubkey: "b".repeat(64),
  state: "PUBLISHED", progressBps: 0, relayConfirmations: 2, verified: true,
  projectedAt: "2027-01-15T08:00:00.000Z", issues: [],
};

describe("leitura das pools LRP", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("lista somente os campos públicos verificados", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "READY", pools: [pool], issues: [] }), { status: 200 }));
    render(<LrpPoolsExplorer mode="LRP" />);
    expect(await screen.findByRole("heading", { name: "Venda internacional" })).toBeInTheDocument();
    expect(screen.getByLabelText("Publicação confirmada")).toBeInTheDocument();
    expect(screen.queryByText(/cpf|invoice|nwc|preimage|nome civil/i)).not.toBeInTheDocument();
  });

  it("mantém SHADOW invisível e registra a comparação sem trocar a tela", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "READY", pools: [pool], issues: [] }), { status: 200 }));
    const { container } = render(<LrpPoolsExplorer mode="SHADOW" />);
    await waitFor(() => expect(warning).toHaveBeenCalledWith("LRP_SHADOW_POOL_DIVERGENCE", [{ poolId: pool.poolId, divergences: ["LEGACY_POOL_NOT_FOUND"] }]));
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra erro explícito e nunca oferece ação financeira", () => {
    render(<LrpPoolDetailsView pool={{ ...pool, verified: false, relayConfirmations: 1, issues: ["RELAY_QUORUM_INSUFFICIENT"] }} />);
    expect(screen.getByText(/aguarda confirmações suficientes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /aporte indisponível/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /simular aporte/i })).not.toBeInTheDocument();
  });

  it("não inclui fixtures na listagem LRP", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "READY", pools: [], issues: [] }), { status: 200 }));
    render(<PoolsExplorer mode="LRP" />);
    expect(await screen.findByText(/não foi encontrada nos registros públicos/i)).toBeInTheDocument();
    for (const fixture of publicPools) expect(screen.queryByText(fixture.title)).not.toBeInTheDocument();
  });

  it("não usa fixtures quando o banco está indisponível", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "UNAVAILABLE", pools: [], issues: ["DATABASE_UNAVAILABLE"] }), { status: 503 }));
    render(<PoolsExplorer mode="LRP" />);
    expect(await screen.findByText(/não foi possível consultar as pools agora/i)).toBeInTheDocument();
    for (const fixture of publicPools) expect(screen.queryByText(fixture.title)).not.toBeInTheDocument();
  });
});
