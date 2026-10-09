"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CircleDollarSign, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { PublicKey } from "@solana/web3.js";

import { buildFundPoolTransaction, type BrowserSolanaProvider } from "@/lib/grp-solana";

type Opportunity = {
  receivableId: string;
  description: string;
  nominalUsdCents: string;
  dueAt: string;
  marketName: string | null;
  requesterWallet: string;
  poolPda: string;
  targetAmountUsdcMinor: string;
  fundedAmountUsdcMinor: string;
  minimumPartialBps: number;
  discountBps: number;
  fundingDeadlineUnix: string;
  status: string;
};

type FundingState = {
  amount?: string;
  working?: boolean;
  message?: string;
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
  const [funding, setFunding] = useState<Record<string, FundingState>>({});

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

  async function fund(item: Opportunity) {
    const current = funding[item.poolPda] ?? {};
    const rawAmount = (current.amount ?? "").replace(",", ".");
    const numericAmount = Number(rawAmount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFunding((state) => ({
        ...state,
        [item.poolPda]: { ...current, message: "Informe um aporte válido em USDC." },
      }));
      return;
    }

    setFunding((state) => ({
      ...state,
      [item.poolPda]: { ...current, working: true, message: "" },
    }));

    try {
      const provider = (window as Window & { solana?: BrowserSolanaProvider }).solana;
      if (!provider?.connect || !provider.signAndSendTransaction) {
        throw new Error("Nenhuma carteira Solana compatível foi encontrada.");
      }

      const connected = await provider.connect();
      const investor = new PublicKey(connected.publicKey.toBase58());
      const usdcMintValue = process.env.NEXT_PUBLIC_GRP_USDC_MINT?.trim();
      if (!usdcMintValue) throw new Error("O mint USDC do GRP não está configurado.");

      const amountUsdcMinor = BigInt(Math.round(numericAmount * 1_000_000));
      const target = BigInt(item.targetAmountUsdcMinor);
      const funded = BigInt(item.fundedAmountUsdcMinor);
      const remaining = target - funded;
      if (amountUsdcMinor > remaining) {
        throw new Error("O aporte supera o valor ainda disponível nesta oportunidade.");
      }

      const built = await buildFundPoolTransaction({
        investor,
        requester: new PublicKey(item.requesterWallet),
        receivableId: item.receivableId,
        usdcMint: new PublicKey(usdcMintValue),
        amountUsdcMinor,
      });

      const sent = await provider.signAndSendTransaction(built.transaction);
      await built.connection.confirmTransaction(
        {
          signature: sent.signature,
          blockhash: built.blockhash,
          lastValidBlockHeight: built.lastValidBlockHeight,
        },
        "confirmed",
      );

      const response = await fetch(
        "/api/grp/pools/" + item.receivableId + "/fund",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: sent.signature,
            amountUsdcMinor: amountUsdcMinor.toString(),
          }),
        },
      );
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "O aporte confirmou, mas não pôde ser sincronizado.");
      }

      setFunding((state) => ({
        ...state,
        [item.poolPda]: {
          amount: "",
          working: false,
          message: "Aporte confirmado na Solana Devnet.",
        },
      }));
      await refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Não foi possível financiar esta oportunidade.";
      const friendly =
        raw === "INVESTOR_USDC_ACCOUNT_NOT_FOUND"
          ? "Essa carteira ainda não possui uma conta para o USDC de teste configurado no GRP."
          : raw === "INSUFFICIENT_DEVNET_USDC"
            ? "Saldo de USDC Devnet insuficiente para este aporte."
            : raw === "INVESTOR_NEEDS_DEVNET_SOL"
              ? "A carteira investidora precisa de um pequeno saldo de SOL Devnet para taxas."
              : raw === "GRP_INVESTOR_ALREADY_FUNDED_POOL"
                ? "Esta carteira já fez um aporte nesta pool. No MVP, cada carteira investe uma vez por oportunidade."
                : /simulation|failed to simulate|revert/i.test(raw)
                  ? "A Solana recusou o aporte. Confirme Devnet, saldo de SOL, saldo de USDC e se a pool ainda está aberta."
                  : raw;

      setFunding((state) => ({
        ...state,
        [item.poolPda]: { ...current, working: false, message: friendly },
      }));
    }
  }

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
        const remaining = Math.max(0, target - funded);
        const current = funding[item.poolPda] ?? {};
        const open = item.status === "OPEN" && remaining > 0;

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
              <div><dt>Disponível</dt><dd>{usdc(String(remaining))}</dd></div>
              <div><dt>Desconto</dt><dd>{(item.discountBps / 100).toFixed(1)}%</dd></div>
              <div><dt>Funding mínimo</dt><dd>{(item.minimumPartialBps / 100).toFixed(0)}%</dd></div>
              <div><dt>Prazo</dt><dd>{new Date(Number(item.fundingDeadlineUnix) * 1000).toLocaleDateString("pt-BR")}</dd></div>
              <div><dt>Vencimento</dt><dd>{new Date(item.dueAt).toLocaleDateString("pt-BR")}</dd></div>
            </dl>

            {open ? (
              <div className="confirmation-form" style={{ marginTop: "1.25rem" }}>
                <span className="eyebrow"><WalletCards size={16} /> Investir em USDC</span>
                <p>
                  O aporte sai da sua carteira somente depois da confirmação na Phantom e entra no vault desta pool na Solana Devnet.
                </p>
                <label>
                  Valor do aporte (USDC)
                  <input
                    inputMode="decimal"
                    placeholder="100.00"
                    value={current.amount ?? ""}
                    onChange={(event) => {
                      const amount = event.target.value;
                      setFunding((state) => ({
                        ...state,
                        [item.poolPda]: { ...state[item.poolPda], amount, message: "" },
                      }));
                    }}
                  />
                </label>
                <div className="demo-actions">
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={current.working}
                    onClick={() => void fund(item)}
                  >
                    <CircleDollarSign size={17} />
                    {current.working ? "Aguardando carteira…" : "Investir na oportunidade"}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={current.working}
                    onClick={() => {
                      setFunding((state) => ({
                        ...state,
                        [item.poolPda]: {
                          ...state[item.poolPda],
                          amount: (remaining / 1_000_000).toFixed(2),
                          message: "",
                        },
                      }));
                    }}
                  >
                    Preencher valor restante
                  </button>
                </div>
                {current.message ? <p role="status">{current.message}</p> : null}
              </div>
            ) : (
              <div className="confirmation-form__security">
                <ShieldCheck size={18} />
                Esta oportunidade não aceita novos aportes no estado atual.
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
