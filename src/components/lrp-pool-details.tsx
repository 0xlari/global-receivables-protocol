"use client";

import { AlertTriangle, BadgeCheck, Bitcoin, Clock3, MessageCircle, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { LrpPoolOperationalState } from "@/components/lrp-pools-explorer";
import type { LrpPoolPublicView, LrpPoolReadResult } from "@/services/lrp-pool-read-service";

const sats = (value: string) => `${Number(value).toLocaleString("pt-BR")} sats`;
const date = (value: number) => new Intl.DateTimeFormat("pt-BR").format(new Date(value * 1_000));
const bps = (value: number) => `${(value / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
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

export function LrpPoolDetails({ poolId }: { poolId: string }) {
  const [result, setResult] = useState<LrpPoolReadResult | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/lrp/pools?poolId=${encodeURIComponent(poolId)}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as LrpPoolReadResult;
      if (active) setResult(body);
    }).catch(() => active && setResult({ status: "UNAVAILABLE", pools: [], issues: ["DATABASE_UNAVAILABLE"] }));
    return () => { active = false; };
  }, [poolId]);
  if (!result) return <div className="shell empty-demo-state" role="status">Carregando informações verificadas…</div>;
  const pool = result.pools[0];
  if (!pool) return <div className="shell empty-demo-state"><LrpPoolOperationalState issues={result.issues.length ? result.issues : ["PROJECTION_NOT_FOUND"]} /></div>;
  return <LrpPoolDetailsView pool={pool} />;
}

export function LrpPoolDetailsView({ pool }: { pool: LrpPoolPublicView }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Ajude esta pool BTC a fechar. Veja prazo, riscos e informações verificadas: ${siteUrl}/pools/${pool.poolId}`)}`;
  return <div className="shell pool-detail" data-source="LRP">
    <header className="pool-detail__header"><span className="eyebrow"><Bitcoin aria-hidden="true" size={16} /> Pool BTC verificada</span><h1>{pool.title}</h1><p>{pool.providerPseudonym} · {pool.originalCurrency}. Dados pessoais, documentos e autorizações de pagamento permanecem privados.</p>{pool.verified ? <span className="tag tag--soft"><BadgeCheck size={15} /> Publicação confirmada pela rede</span> : <span className="tag tag--soft"><AlertTriangle size={15} /> Verificação pendente</span>}</header>
    <LrpPoolOperationalState issues={pool.issues} />
    <div className="pool-detail__layout"><main>
      <section className="pool-detail__amount"><span>Meta da pool</span><strong>{sats(pool.targetSats)}</strong><div className="progress" role="progressbar" aria-label={`${pool.progressBps / 100}% financiado`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pool.progressBps / 100}><span style={{ width: `${pool.progressBps / 100}%` }} /></div><small>{poolStateLabels[pool.state] ?? "Status em atualização"} · mínimo parcial {bps(pool.minimumPartialBps)} · financiamento até {date(pool.fundingDeadline)}</small></section>
      <section className="pool-detail__facts" aria-label="Condições públicas da pool"><article><Clock3 aria-hidden="true" /><span>Vencimento</span><strong>{date(pool.dueAt)}</strong></article><article><TrendingUp aria-hidden="true" /><span>Desconto / retorno</span><strong>{bps(pool.discountBps)} / {bps(pool.expectedReturnBps)}</strong></article><article><ShieldCheck aria-hidden="true" /><span>Penalidade por atraso</span><strong>{bps(pool.fixedLateFeeBps)} + {bps(pool.dailyLateInterestBps)}/dia, limite {bps(pool.maximumPenaltyBps)}</strong></article><article><Users aria-hidden="true" /><span>Reputação pública</span><strong>{pool.publicReputation.length ? pool.publicReputation.join(", ") : "Ainda sem fatos públicos"}</strong></article></section>
      <section className="risk-card"><h2>Verificação pública</h2><p>Identificador da plataforma responsável: <code>{pool.originatorPubkey.slice(0, 12)}…</code></p><p>Código de verificação: <code>{pool.eventId}</code></p><p>As informações públicas foram verificadas e podem ser recuperadas novamente sem alterar o registro assinado.</p></section>
    </main><aside className="pool-detail__action"><span className="kicker">Aportes ainda não estão disponíveis</span><h2>Consulte e compartilhe esta pool</h2><p>Nenhuma transferência será iniciada nesta versão.</p><button className="button button--primary" type="button" disabled>Aporte indisponível</button><a className="share-link share-link--large" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" size={18} /> Compartilhar no WhatsApp</a></aside></div>
  </div>;
}
