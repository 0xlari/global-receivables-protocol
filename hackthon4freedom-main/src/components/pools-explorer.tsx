"use client";

import { useEffect, useState } from "react";

import { PoolCard } from "@/components/pool-card";
import { LrpPoolsExplorer } from "@/components/lrp-pools-explorer";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import { publicPools, type PublicPool } from "@/data/public-pools";
import { DEMO_CHANGED_EVENT, getDemoPlatformState } from "@/lib/demo-store";

function LegacyPoolsExplorer({ mode }: { mode: Exclude<LrpOriginationMode, "LRP"> }) {
  const [pools, setPools] = useState<PublicPool[]>(publicPools);
  useEffect(() => {
    const refresh = () => setPools([...getDemoPlatformState().pools, ...publicPools]);
    queueMicrotask(refresh);
    window.addEventListener(DEMO_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DEMO_CHANGED_EVENT, refresh);
  }, []);
  return <div className="pool-grid">{pools.map((pool) => <PoolCard key={pool.id} pool={pool} />)}<LrpPoolsExplorer mode={mode} legacyPools={pools} /></div>;
}

export function PoolsExplorer({ mode = "LEGACY" }: { mode?: LrpOriginationMode }) {
  if (mode === "LRP") return <LrpPoolsExplorer mode="LRP" />;
  return <LegacyPoolsExplorer mode={mode} />;
}
