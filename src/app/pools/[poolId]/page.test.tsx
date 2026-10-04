import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  findPublicPool: vi.fn(),
  read: vi.fn(async () => ({ status: "READY", pools: [], issues: ["PROJECTION_NOT_FOUND"] })),
}));

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/config/lrp-mode", () => ({ lrpOriginationModeFromEnvironment: () => "LRP" }));
vi.mock("@/db/client", () => ({ databaseFromEnvironment: () => ({ db: { source: "postgres" }, close: mocks.close }) }));
vi.mock("@/services/lrp-pool-read-service", () => ({ readLrpPoolProjections: mocks.read }));
vi.mock("@/data/public-pools", () => ({
  publicPools: [{ id: "local-only", title: "Pool somente local" }],
  findPublicPool: mocks.findPublicPool,
}));

import PoolDetailsPage from "./page";

describe("detalhe canônico da pool", () => {
  it("não abre pool local quando não existe projeção LRP", async () => {
    await expect(PoolDetailsPage({ params: Promise.resolve({ poolId: "local-only" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.read).toHaveBeenCalledWith({ source: "postgres" }, { poolId: "local-only" });
    expect(mocks.findPublicPool).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
