import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoolDetailsSource } from "@/components/pool-details-source";
import { PoolDetailsClient } from "@/components/pool-details-client";
import { LrpPoolDetailsView } from "@/components/lrp-pool-details";
import { lrpOriginationModeFromEnvironment } from "@/config/lrp-mode";
import { findPublicPool, publicPools } from "@/data/public-pools";
import { databaseFromEnvironment } from "@/db/client";
import { readLrpPoolProjections } from "@/services/lrp-pool-read-service";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return lrpOriginationModeFromEnvironment() === "LRP" ? [] : publicPools.map(({ id }) => ({ poolId: id }));
}

export async function generateMetadata({ params }: { params: Promise<{ poolId: string }> }): Promise<Metadata> {
  if (lrpOriginationModeFromEnvironment() === "LRP") return { title: "Pool BTC", description: "Detalhes públicos verificados da pool BTC." };
  const pool = findPublicPool((await params).poolId);
  if (!pool) return {};
  return { title: pool.title, description: `Pool BTC ${pool.funded}% financiada, com ${pool.coverage}% de cobertura do principal.` };
}

export default async function PoolDetailsPage({ params }: { params: Promise<{ poolId: string }> }) {
  const poolId = (await params).poolId;
  const mode = lrpOriginationModeFromEnvironment();
  if (mode === "LRP") {
    const database = databaseFromEnvironment();
    try {
      const result = await readLrpPoolProjections(database.db, { poolId });
      if (result.status === "UNAVAILABLE") return <div className="inner-page"><div className="shell empty-demo-state">Não foi possível consultar esta pool agora.</div></div>;
      const pool = result.pools[0];
      if (!pool) notFound();
      return <div className="inner-page"><LrpPoolDetailsView pool={pool} /></div>;
    } finally {
      await database.close();
    }
  }
  const isKnownLegacyPool = Boolean(findPublicPool(poolId));
  return <div className="inner-page">{isKnownLegacyPool ? <PoolDetailsClient poolId={poolId} /> : <PoolDetailsSource poolId={poolId} mode={mode} />}</div>;
}
