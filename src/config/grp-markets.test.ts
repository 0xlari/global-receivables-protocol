import { describe, expect, it } from "vitest";

import { ERH_MARKET_RULES } from "@/config/erh-market-rules";
import { GRP_MARKETS, MARKET_LIFECYCLE, getGrpMarket } from "@/config/grp-markets";

describe("GRP market registry", () => {
  it("keeps Elas Recebem Hoje active with the approved economics", () => {
    const market = getGrpMarket("elas-recebem-hoje");

    expect(market).not.toBeNull();
    expect(market?.status).toBe("ACTIVE");
    expect(market?.settlementAsset).toBe("USDC");
    expect(market?.economics).toEqual({
      advanceBps: 8_000,
      investorReturnBps: 350,
      marketFeeBps: 100,
      protocolFeeBps: 50,
      residualToRequester: true,
    });
    expect(market?.protocolFeeBps).toBe(ERH_MARKET_RULES.protocolFeeBps);
  });

  it("keeps GRP Direct isolated as a sandbox", () => {
    const market = getGrpMarket("grp-direct");

    expect(market?.status).toBe("SANDBOX");
    expect(market?.publicEntry).toBeNull();
    expect(market?.economics).toBeNull();
  });

  it("defines the complete operational lifecycle", () => {
    expect(MARKET_LIFECYCLE.map((item) => item.status)).toEqual([
      "PROPOSED",
      "SANDBOX",
      "ACTIVE",
      "PAUSED",
      "SUSPENDED",
      "RETIRED",
    ]);
    expect(GRP_MARKETS).toHaveLength(2);
  });
});
