import { ERH_MARKET_RULES } from "@/config/erh-market-rules";

export type GrpMarketStatus =
  | "PROPOSED"
  | "SANDBOX"
  | "ACTIVE"
  | "PAUSED"
  | "SUSPENDED"
  | "RETIRED";

export type GrpMarketDefinition = {
  id: string;
  slug: string;
  name: string;
  geography: string;
  status: GrpMarketStatus;
  operator: string;
  settlementAsset: "USDC";
  rulesVersion: string;
  protocolFeeBps: number;
  audience: string;
  description: string;
  publicEntry: string | null;
  economics: null | {
    advanceBps: number;
    investorReturnBps: number;
    marketFeeBps: number;
    protocolFeeBps: number;
    residualToRequester: true;
  };
};

export const GRP_MARKETS: GrpMarketDefinition[] = [
  {
    id: "market_erh_br_v1",
    slug: "elas-recebem-hoje",
    name: "Elas Recebem Hoje",
    geography: "Brazil",
    status: "ACTIVE",
    operator: "Elas Recebem Hoje",
    settlementAsset: "USDC",
    rulesVersion: "erh-v1",
    protocolFeeBps: ERH_MARKET_RULES.protocolFeeBps,
    audience:
      "Professionals in Brazil with eligible receivables from payers abroad.",
    description:
      "Brazilian receivables market for professionals receiving future payments from global clients.",
    publicEntry: "/elas-recebem-hoje",
    economics: {
      advanceBps: ERH_MARKET_RULES.advanceBps,
      investorReturnBps: ERH_MARKET_RULES.investorReturnBps,
      marketFeeBps: ERH_MARKET_RULES.marketFeeBps,
      protocolFeeBps: ERH_MARKET_RULES.protocolFeeBps,
      residualToRequester: true,
    },
  },
  {
    id: "market_grp_direct_v1",
    slug: "grp-direct",
    name: "GRP Direct",
    geography: "Global",
    status: "SANDBOX",
    operator: "GRP",
    settlementAsset: "USDC",
    rulesVersion: "grp-v1",
    protocolFeeBps: 50,
    audience: "Protocol testing and infrastructure validation.",
    description:
      "Controlled sandbox used to validate GRP primitives outside a public Market experience.",
    publicEntry: null,
    economics: null,
  },
];

export const MARKET_LIFECYCLE: Array<{
  status: GrpMarketStatus;
  label: string;
  meaning: string;
}> = [
  { status: "PROPOSED", label: "Proposed", meaning: "Operator and market thesis submitted for review." },
  { status: "SANDBOX", label: "Sandbox", meaning: "Controlled limits while rules, rails and operations are validated." },
  { status: "ACTIVE", label: "Active", meaning: "Approved Market can originate eligible receivables." },
  { status: "PAUSED", label: "Paused", meaning: "New origination temporarily stopped by the operator or protocol." },
  { status: "SUSPENDED", label: "Suspended", meaning: "Activity halted after a control, compliance or operational issue." },
  { status: "RETIRED", label: "Retired", meaning: "Market no longer originates new receivables; historical state remains." },
];

export function getGrpMarket(slug: string) {
  return GRP_MARKETS.find((market) => market.slug === slug) ?? null;
}
