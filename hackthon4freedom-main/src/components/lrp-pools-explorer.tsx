"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BadgeCheck, Bitcoin, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { LrpOriginationMode } from "@/config/lrp-mode";
import type { PublicPool } from "@/data/public-pools";
import type { LrpPoolPublicView, LrpPoolReadIssue, LrpPoolReadResult } from "@/services/lrp-pool-read-service";

const issueLabels: Record<LrpPoolReadIssue, string> = {
  PROJECTION_NOT_FOUND: "Esta pool não foi encontrada nos registros públicos.",
  PROJECTION_STALE: "As informações desta pool aguardam atualização.",
  CANONICAL_EVENT_MISSING: "O registro público confirmado não está disponível agora.",
  RELAY_QUORUM_INSUFFICIENT: "A publicação ainda aguarda confirmações suficientes.",
  INVALID_EVENT_GRAPH: "As informações públicas desta pool não puderam ser verificadas.",
  REDUCER_CONFLICT: "Foram encontradas informações públicas conflitantes para esta pool.",
  DATABASE_UNAVAILABLE: "Não foi possível consultar as pools agora.",
  REBUILD_IN_PROGRESS: "O histórico público está sendo atualizado.",
};

const formatSats = (value: string) => `${Number(value).toLocaleString("pt-BR")} sats`;
const formatDate = (value: number) => new Intl.DateTimeFormat("pt-BR").format(new Date(value * 1_000));
const formatBps = (value: number) => `${(value / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const poolStateLabels: Record<string, string> = {
  PUBLISHED: "Aberta para consulta",
  OPEN: "Aberta",
  PARTIALLY_FUNDED: "Parcialmente financiada",
  FULLY_FUNDED: "Financiamento completo",
  PARTIAL_ACCEPTANCE_PENDING: "Aguardando aceite parcial",
  PARTIAL_ACCEPTED: "Financiamento parcial aceito",
  CANCELLED: "Cancelada",
  REFUND_REQUIRED: "Reembolso necessário",
  DISBURSED: "Antecipação liberada",
  SETTLED: "Concluída",
  DEFAULTED: "Pagamento em atraso",
  DISPUTED: "Em contestação",
};

export function LrpPoolOperationalState({ issues }: { issues: readonly LrpPoolReadIssue[] }) {
  if (!issues.length) return null;
  return <div className="lrp-pool-state" role="status"><AlertTriangle aria-hidden="true" size={18} /><div>{issues.map((issue) => <p key={issue}>{issueLabels[issue]}</p>)}</div></div>;
}

export function LrpPoolCard({ pool }: { pool: LrpPoolPublicView }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const poolUrl = `${siteUrl}/pools/${pool.poolId}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Ajude esta pool BTC a fechar. Veja prazo, riscos e informações verificadas: ${poolUrl}`)}`;
  return <article className="pool-card" data-source="LRP">
    <div className="pool-card__topline"><span className="tag tag--soft"><Bitcoin aria-hidden="true" size={15} /> Pool BTC verificada</span>{pool.verified ? <BadgeCheck aria-label="Publicação confirmada" size={20} /> : <AlertTriangle aria-label="Verificação pendente" size={20} />}</div>
    <h3>{pool.title}</h3><p>{pool.providerPseudonym}</p><div className="pool-card__amount">{formatSats(pool.targetSats)}</div>
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pool.progressBps / 100} aria-label={`${pool.progressBps / 100}% financiado`}><span style={{ width: `${pool.progressBps / 100}%` }} /></div>
    <div className="pool-card__meta"><span>{poolStateLabels[pool.state] ?? "Status em atualização"}</span><span>Vence {formatDate(pool.dueAt)}</span></div>
    <div className="pool-card__coverage"><span>Retorno esperado</span><strong>{formatBps(pool.expectedReturnBps)}</strong></div>
    <LrpPoolOperationalState issues={pool.issues} />
    <div className="pool-card__actions"><Link className="button button--secondary" href={`/pools/${pool.poolId}`}>Ver detalhes <ArrowUpRight aria-hidden="true" size={17} /></Link><a className="share-link" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" size={17} /> WhatsApp</a></div>
  </article>;
}

export function compareShadowPoolViews(lrpPools: readonly LrpPoolPublicView[], legacyPools: readonly PublicPool[]) {
  return lrpPools.map((pool) => {
    const legacy = legacyPools.find((candidate) => candidate.id === pool.poolId);
    const divergences = !legacy ? ["LEGACY_POOL_NOT_FOUND"] : [
      ...(legacy.title === pool.title ? [] : ["TITLE_DIVERGENCE"]),
      ...(legacy.targetSats === Number(pool.targetSats) ? [] : ["TARGET_SATS_DIVERGENCE"]),
      ...(legacy.discountBps === pool.discountBps ? [] : ["DISCOUNT_DIVERGENCE"]),
    ];
    return { poolId: pool.poolId, divergences };
  }).filter((comparison) => comparison.divergences.length > 0);
}

export function LrpPoolsExplorer({ mode, legacyPools = [] }: { mode: LrpOriginationMode; legacyPools?: readonly PublicPool[] }) {
  const [result, setResult] = useState<LrpPoolReadResult | null>(null);
  useEffect(() => {
    let active = true;
    const path = mode === "LEGACY" ? "/api/lrp/pools?canonical=1" : "/api/lrp/pools";
    fetch(path, { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as LrpPoolReadResult;
      if (active) setResult(body);
    }).catch(() => active && setResult({ status: "UNAVAILABLE", pools: [], issues: ["DATABASE_UNAVAILABLE"] }));
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    if (mode !== "SHADOW" || !result) return;
    const divergences = compareShadowPoolViews(result.pools, legacyPools);
    if (divergences.length) console.warn("LRP_SHADOW_POOL_DIVERGENCE", divergences);
  }, [legacyPools, mode, result]);

  if (mode === "SHADOW") {
    return null;
  }
  if (mode === "LEGACY" && (!result || !result.pools.length)) return null;
  if (!result) return <div className="empty-demo-state" role="status">Carregando pools verificadas…</div>;
  if (!result.pools.length) return <div className="empty-demo-state"><LrpPoolOperationalState issues={result.issues.length ? result.issues : ["PROJECTION_NOT_FOUND"]} /></div>;
  if (mode === "LEGACY") return <>{result.pools.map((pool) => <LrpPoolCard key={pool.eventId} pool={pool} />)}</>;
  return <><LrpPoolOperationalState issues={result.issues.filter((issue) => issue === "REBUILD_IN_PROGRESS")} /><div className="pool-grid">{result.pools.map((pool) => <LrpPoolCard key={pool.eventId} pool={pool} />)}</div></>;
}
