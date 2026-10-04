"use client";

import { useEffect, useState } from "react";

import { LrpPoolDetails } from "@/components/lrp-pool-details";
import { PoolDetailsClient } from "@/components/pool-details-client";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import { findPublicPool } from "@/data/public-pools";
import { findDemoPoolById } from "@/lib/demo-store";

export function PoolDetailsSource({ poolId, mode }: { poolId: string; mode: LrpOriginationMode }) {
  const [localPoolExists, setLocalPoolExists] = useState<boolean | null>(() => Boolean(findPublicPool(poolId)));
  useEffect(() => {
    queueMicrotask(() => setLocalPoolExists(Boolean(findPublicPool(poolId) ?? findDemoPoolById(poolId))));
  }, [poolId]);

  if (mode === "LRP") return <LrpPoolDetails poolId={poolId} />;
  if (localPoolExists === null) return <div className="shell empty-demo-state" role="status">Localizando a pool…</div>;
  if (localPoolExists) return <PoolDetailsClient poolId={poolId} />;
  // A fonte canônica pertence à entidade: uma pool publicada pelo LRP continua
  // sendo lida pelo LRP mesmo depois de a flag global voltar para LEGACY.
  return <LrpPoolDetails poolId={poolId} />;
}
