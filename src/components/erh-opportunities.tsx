"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CircleDollarSign, RefreshCw, ShieldCheck } from "lucide-react";

type Opportunity = {
  receivableId: string;
  description: string;
  nominalUsdCents: string;
  dueAt: string;
  marketName: string | null;
  poolPda: string;
  targetAmountUsdcMinor: string;
  fundedAmountUsdcMinor: string;
  minimumPartialBps: number;
  discountBps: number;
  fundingDeadlineUnix: string;
  status: string;
};

function usdc(value: string) {
  return (Number(value) / 1_000_000).toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
  });
}

export function ErhOpportunities() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  async function refresh() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/grp/pools", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/elas-recebem-hoje/entrar?next=/elas-recebem-hoje/oportunidades");
        return;
      }
      const body = await response.json() as { opportunities?: Opportunity[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar as oportunidades.");
      setItems(body.opportunities ?? []);
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar as oportunidades.");
      setState("error");
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/grp/pools", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/elas-recebem-hoje/entrar?next=/elas-recebem-hoje/oportunidades");
          return;
        }
        const body = await response.json() as { opportunities?: Opportunity[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar as oportunidades.");
        if (!active) return;
        setItems(body.opportunities ?? []);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar as oportunidades.");
        setState("error");
      });
    return () => { active = false; };
  }, []);

  if (state === "loading") {
    return <div className="dashboard-loading">Carregando oportunidades GRP…</div>;
  }

  if (state === "error") {
    return (
      <div className="empty-demo-state">
        <p>{message}</p>
        <button className="button button--secondary" type="button" onClick={() => void refresh()}>
          <RefreshCw size={17} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-demo-state">
        <ShieldCheck size={28} />
        <h2>Nenhuma oportunidade GRP está aberta agora.</h2>
        <p>Uma oportunidade aparecerá aqui depois que um recebível aprovado tiver uma pool USDC criada.</p>
        <Link className="button button--primary" href="/elas-recebem-hoje/painel">
          Ver meus recebíveis <ArrowRight size={17} />
        </Link>
      </div>
    );
  }

  return (
    <div className="admin-demo__list">
      {items.map((item) => {
        const target = Number(item.targetAmountUsdcMinor);
        const funded = Number(item.fundedAmountUsdcMinor);
        const progress = target > 0 ? Math.min(100, Math.round((funded / target) * 100)) : 0;

        return (
          <article key={item.poolPda}>
            <div className="admin-demo__status">
              <span className="tag tag--soft">{item.status}</span>
              <small>{item.marketName ?? "Elas Recebem Hoje"}</small>
            </div>
            <h3>{item.description}</h3>
            <dl>
              <div><dt>Meta</dt><dd>{usdc(item.targetAmountUsdcMinor)}</dd></div>
              <div><dt>Financiado</dt><dd>{usdc(item.fundedAmountUsdcMinor)} · {progress}%</dd></div>
              <div><dt>Desconto</dt><dd>{(item.discountBps / 100).toFixed(1)}%</dd></div>
              <div><dt>Funding mínimo</dt><dd>{(item.minimumPartialBps / 100).toFixed(0)}%</dd></div>
              <div><dt>Prazo</dt><dd>{new Date(Number(item.fundingDeadlineUnix) * 1000).toLocaleDateString("pt-BR")}</dd></div>
              <div><dt>Vencimento</dt><dd>{new Date(item.dueAt).toLocaleDateString("pt-BR")}</dd></div>
            </dl>
            <div className="confirmation-form__security">
              <CircleDollarSign size={18} />
              Pool registrada na Solana Devnet. O aporte em USDC entra no P2.3.
            </div>
          </article>
        );
      })}
    </div>
  );
}
