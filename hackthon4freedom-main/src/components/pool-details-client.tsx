"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Bitcoin, Clock3, FlaskConical, MessageCircle, ShieldCheck, TrendingUp, Users } from "lucide-react";

import { findPublicPool, type PublicPool } from "@/data/public-pools";
import { estimatePoolReturnSats } from "@/domain/pool-return-estimate";
import { findDemoPoolById, recordDemoContribution } from "@/lib/demo-store";

const sats = (value: number) => `${Math.max(0, Math.round(value)).toLocaleString("pt-BR")} sats`;

export function PoolDetailsClient({ poolId }: { poolId: string }) {
  const [pool, setPool] = useState<PublicPool | undefined>(() => findPublicPool(poolId));
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [profileId, setProfileId] = useState("");
  const [amount, setAmount] = useState(100_000);
  const [message, setMessage] = useState("");

  useEffect(() => {
    queueMicrotask(() => setPool(findPublicPool(poolId) ?? findDemoPoolById(poolId)));
    fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return setAuthenticated(false);
      const body = await response.json() as { profile?: { id: string } };
      if (!body.profile?.id) return setAuthenticated(false);
      setProfileId(body.profile.id); setAuthenticated(true);
    }).catch(() => setAuthenticated(false));
  }, [poolId]);

  const remaining = pool ? Math.max(0, pool.targetSats - pool.fundedSats) : 0;
  const safeAmount = Math.max(1, Math.min(amount || 1, Math.max(1, remaining)));
  const estimate = useMemo(() => pool ? estimatePoolReturnSats(safeAmount, pool.discountBps) : null, [pool, safeAmount]);

  if (!pool) return <div className="shell empty-demo-state">Pool não encontrada neste navegador.</div>;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Ajude esta pool BTC a fechar. Veja prazo, riscos e cobertura: ${siteUrl}/pools/${pool.id}`)}`;

  function contribute() {
    if (!estimate) return;
    recordDemoContribution(profileId, pool!, safeAmount, estimate.centralSats);
    const stored = findDemoPoolById(pool!.id);
    if (stored) setPool({ ...stored });
    setMessage(`Aporte demonstrativo de ${sats(safeAmount)} registrado. Nenhum sat foi movimentado.`);
  }

  return <div className="shell pool-detail">
    <header className="pool-detail__header"><span className="eyebrow"><Bitcoin aria-hidden="true" size={16} /> Pool BTC avaliada</span><h1>{pool.title}</h1><p>Dados pessoais, documentos e informações do pagador permanecem privados.</p>{pool.isDemo ? <span className="tag tag--soft"><FlaskConical size={15} /> Criada na demonstração</span> : null}</header>
    <div className="pool-detail__layout"><main>
      <section className="pool-detail__amount"><span>Meta da pool</span><strong>{pool.amount}</strong><div className="progress" role="progressbar" aria-label={`${pool.funded}% financiado`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pool.funded}><span style={{ width: `${pool.funded}%` }} /></div><small>{pool.funded}% financiado · {sats(remaining)} ainda disponíveis · prazo: {pool.fundingDeadline}</small></section>
      <section className="pool-detail__facts" aria-label="Condições da pool"><article><Clock3 aria-hidden="true" /><span>Vencimento</span><strong>{pool.due}</strong></article><article><TrendingUp aria-hidden="true" /><span>Desconto</span><strong>{pool.discount}</strong></article><article><ShieldCheck aria-hidden="true" /><span>Cobertura do principal</span><strong>{pool.coverage}%</strong></article><article><Users aria-hidden="true" /><span>Reputação</span><strong>{pool.reputation}</strong></article></section>
      <section className="risk-card"><h2>O que está coberto</h2><p>Garantia em BTC e tesouraria reservada cobrem {pool.coverage}% do principal. Rendimentos esperados e variação do Bitcoin não são cobertos. O risco restante é de quem aporta.</p></section>
    </main><aside className="pool-detail__action contribution-estimator"><span className="kicker">Simular aporte</span><h2>Quanto você pode receber?</h2><label>Valor do aporte em sats<input type="number" min={1} max={Math.max(1, remaining)} step={1_000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
      {estimate ? <div className="return-estimate"><div className="return-estimate__main"><span>Estimativa central</span><strong>{sats(estimate.centralSats)}</strong><small>Principal + aproximadamente {sats(estimate.estimatedProfitSats)} de resultado.</small></div><dl><div><dt>Se BTC subir 10%</dt><dd>≈ {sats(estimate.btcUpTenPercentSats)}</dd></div><div><dt>Se BTC cair 10%</dt><dd>≈ {sats(estimate.btcDownTenPercentSats)}</dd></div></dl></div> : null}
      <p className="estimator-warning">Estimativa, não promessa. O pagamento nasce em USD e será convertido em BTC no vencimento; cotação, taxas e perdas podem alterar os sats finais.</p>
      {authenticated ? <button className="button button--primary" type="button" disabled={remaining <= 0} onClick={contribute}>Simular aporte nesta pool</button> : <Link className="button button--primary" href={`/entrar?next=/pools/${pool.id}`}>Entrar para aportar</Link>}
      {message ? <p className="contribution-success" role="status"><BadgeCheck size={17} /> {message}</p> : null}
      <a className="share-link share-link--large" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" size={18} /> Compartilhar no WhatsApp</a><small>A etapa DLC substituirá esta simulação antes de qualquer aporte real.</small></aside></div>
  </div>;
}
