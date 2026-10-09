"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Copy, FileCheck2, Link2, RefreshCw, CircleDollarSign } from "lucide-react";
import { PublicKey } from "@solana/web3.js";

import { buildCreatePoolTransaction, buildProcessDelinquencyTransaction, type BrowserSolanaProvider } from "@/lib/grp-solana";

type Receivable = {
  id: string;
  status: string;
  description: string;
  purpose: string;
  payerCountry: string;
  nominalUsdCents: string;
  dueAt: string;
  createdAt: string;
  updatedAt: string;
  evidenceHash: string | null;
  confirmationStatus: string | null;
  confirmationExpiresAt: string | null;
  marketId?: string | null;
  marketSlug?: string | null;
  marketName?: string | null;
  requesterWallet?: string | null;
};

const statusLabels: Record<string, string> = {
  DRAFT: "Cadastro iniciado",
  AWAITING_CLIENT: "Aguardando pagador",
  UNDER_VALIDATION: "Em validação",
  NEEDS_CORRECTION: "Correção necessária",
  REJECTED: "Não aprovado",
  APPROVED: "Aprovado",
  POOLED: "Pool criada",
  ADVANCED: "Antecipado",
  DUE: "Em atraso",
  PAID: "Pago",
  DEFAULTED: "Inadimplente",
  CLOSED: "Concluído",
};

function formatUsd(cents: string) {
  return (Number(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "USD" });
}

export function ErhReceivableDetail({ receivableId }: { receivableId: string }) {
  const [item, setItem] = useState<Receivable>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [poolWorking, setPoolWorking] = useState(false);
  const [delinquencyWorking, setDelinquencyWorking] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [targetUsd, setTargetUsd] = useState("");
  const [minimumPartialPercent, setMinimumPartialPercent] = useState("50");
  const [discountPercent, setDiscountPercent] = useState("10");
  const [fundingDeadline, setFundingDeadline] = useState("");

  async function load() {
    setState("loading");
    try {
      const response = await fetch("/api/grp/receivables/" + receivableId, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/elas-recebem-hoje/entrar?next=/elas-recebem-hoje/recebivel/" + receivableId);
        return;
      }
      const body = await response.json() as { receivable?: Receivable; error?: string; serverNowMs?: number };
      if (!response.ok || !body.receivable) throw new Error(body.error ?? "Não foi possível carregar este recebível.");
      if (body.receivable.marketSlug && body.receivable.marketSlug !== "elas-recebem-hoje") {
        throw new Error("Este recebível pertence a outro Market do GRP.");
      }
      setItem(body.receivable);
      const serverNowMs = body.serverNowMs ?? 0;
      setCurrentTimeMs(serverNowMs);
      if (!targetUsd) {
        setTargetUsd(((Number(body.receivable.nominalUsdCents) / 100) * 0.8).toFixed(2));
      }
      if (!fundingDeadline) {
        const due = new Date(body.receivable.dueAt);
        const deadline = new Date(Math.max(serverNowMs + 86_400_000, due.getTime() - 86_400_000));
        setFundingDeadline(deadline.toISOString().slice(0, 10));
      }
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar este recebível.");
      setState("error");
    }
  }

  useEffect(() => {
    let active = true;

    fetch("/api/grp/receivables/" + receivableId, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign(
            "/elas-recebem-hoje/entrar?next=/elas-recebem-hoje/recebivel/" + receivableId,
          );
          return;
        }

        const body = await response.json() as {
          receivable?: Receivable;
          error?: string;
          serverNowMs?: number;
        };

        if (!response.ok || !body.receivable) {
          throw new Error(body.error ?? "Não foi possível carregar este recebível.");
        }
        if (
          body.receivable.marketSlug &&
          body.receivable.marketSlug !== "elas-recebem-hoje"
        ) {
          throw new Error("Este recebível pertence a outro Market do GRP.");
        }
        if (!active) return;

        setItem(body.receivable);
        const serverNowMs = body.serverNowMs ?? 0;
        setCurrentTimeMs(serverNowMs);
        if (!targetUsd) {
          setTargetUsd(((Number(body.receivable.nominalUsdCents) / 100) * 0.8).toFixed(2));
        }
        if (!fundingDeadline) {
          const due = new Date(body.receivable.dueAt);
          const deadline = new Date(Math.max(serverNowMs + 86_400_000, due.getTime() - 86_400_000));
          setFundingDeadline(deadline.toISOString().slice(0, 10));
        }
        setState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar este recebível.",
        );
        setState("error");
      });

    return () => {
      active = false;
    };
  }, [receivableId]);

  async function reissueLink() {
    setMessage("");
    const response = await fetch("/api/grp/receivables/" + receivableId + "/confirmation-link?experience=erh", { method: "POST" });
    const body = await response.json() as { confirmationUrl?: string; error?: string };
    if (!response.ok || !body.confirmationUrl) {
      setMessage(body.error ?? "Não foi possível gerar um novo link.");
      return;
    }
    setLink(body.confirmationUrl);
    setCopied(false);
  }


  async function processDelinquency() {
    if (!item?.requesterWallet) {
      setMessage("A carteira Solana da solicitante não está vinculada.");
      return;
    }

    setDelinquencyWorking(true);
    setMessage("");

    try {
      const provider = (window as Window & { solana?: BrowserSolanaProvider }).solana;
      if (!provider?.connect || !provider.signAndSendTransaction) {
        throw new Error("Nenhuma carteira Solana compatível foi encontrada.");
      }

      const connected = await provider.connect();
      const feePayer = new PublicKey(connected.publicKey.toBase58());
      const requester = new PublicKey(item.requesterWallet);
      const built = await buildProcessDelinquencyTransaction({
        feePayer,
        requester,
        receivableId: item.id,
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
        "/api/grp/receivables/" + item.id + "/delinquency",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature: sent.signature }),
        },
      );
      const body = await response.json() as {
        error?: string;
        status?: string;
        onchainStatus?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "O atraso foi registrado on-chain, mas não pôde ser sincronizado.");
      }

      setMessage(
        body.status === "DEFAULTED"
          ? "Inadimplência registrada no GRP. O pagador ainda pode quitar e curar o default."
          : "Atraso registrado no GRP. O link de pagamento continua disponível ao pagador.",
      );
      await load();
    } catch (error) {
      const raw =
        error instanceof Error ? error.message : "Não foi possível atualizar o estado de atraso.";
      const friendly =
        raw === "DELINQUENCY_WINDOW_NOT_REACHED"
          ? "O GRP só marca atraso a partir de D+1 do vencimento."
          : raw === "DELINQUENCY_KEEPER_NEEDS_DEVNET_SOL"
            ? "A carteira usada para registrar o atraso precisa de um pequeno saldo de SOL Devnet."
            : /simulation|failed to simulate|revert/i.test(raw)
              ? "A Solana recusou a atualização. O recebível precisa estar vencido há pelo menos 1 dia e ainda não pode estar liquidado."
              : raw;
      setMessage(friendly);
    } finally {
      setDelinquencyWorking(false);
    }
  }

  async function createPool() {
    if (!item?.requesterWallet) {
      setMessage("A carteira Solana da solicitante não está vinculada.");
      return;
    }

    setPoolWorking(true);
    setMessage("");

    try {
      const provider = (window as Window & { solana?: BrowserSolanaProvider }).solana;
      if (!provider?.connect || !provider.signAndSendTransaction) {
        throw new Error("Nenhuma carteira Solana compatível foi encontrada.");
      }

      const connected = await provider.connect();
      const requester = new PublicKey(connected.publicKey.toBase58());
      if (requester.toBase58() !== item.requesterWallet) {
        throw new Error("Conecte a mesma carteira usada para criar este recebível.");
      }

      const usdcMintValue = process.env.NEXT_PUBLIC_GRP_USDC_MINT?.trim();
      if (!usdcMintValue) throw new Error("O mint USDC do GRP não está configurado.");

      const targetCents = BigInt(Math.round(Number(targetUsd.replace(",", ".")) * 100));
      if (targetCents <= 0n) throw new Error("Informe um valor de antecipação válido.");
      if (targetCents > BigInt(item.nominalUsdCents)) {
        throw new Error("O valor da oportunidade não pode superar o recebível.");
      }

      const minBps = Math.round(Number(minimumPartialPercent) * 100);
      const discountBps = Math.round(Number(discountPercent) * 100);
      const deadlineUnix = BigInt(
        Math.floor(new Date(fundingDeadline + "T23:59:59").getTime() / 1000),
      );
      const nowUnix = BigInt(Math.floor(currentTimeMs / 1000));
      const dueUnix = BigInt(Math.floor(new Date(item.dueAt).getTime() / 1000));
      if (deadlineUnix <= nowUnix || deadlineUnix >= dueUnix) {
        throw new Error("O prazo de funding precisa ser futuro e anterior ao vencimento.");
      }

      const targetAmountUsdcMinor = targetCents * 10_000n;
      const built = await buildCreatePoolTransaction({
        requester,
        receivableId: item.id,
        usdcMint: new PublicKey(usdcMintValue),
        targetAmountUsdcMinor,
        minimumPartialBps: minBps,
        discountBps,
        fundingDeadlineUnix: deadlineUnix,
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

      const response = await fetch("/api/grp/receivables/" + item.id + "/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: sent.signature,
          targetAmountUsdcMinor: targetAmountUsdcMinor.toString(),
          minimumPartialBps: minBps,
          discountBps,
          fundingDeadlineUnix: deadlineUnix.toString(),
        }),
      });
      const body = await response.json() as { error?: string; poolPda?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "A pool foi enviada, mas não pôde ser sincronizada.");
      }

      setMessage("Oportunidade criada na Solana Devnet. Ela já pode aparecer em Oportunidades.");
      await load();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Não foi possível criar a oportunidade.";
      setMessage(
        /simulation|failed to simulate|revert/i.test(raw)
          ? "A Solana recusou a criação da pool. Confirme a carteira, saldo de SOL Devnet e se o recebível está aprovado."
          : raw,
      );
    } finally {
      setPoolWorking(false);
    }
  }

  if (state === "loading") return <div className="dashboard-loading">Carregando recebível…</div>;

  if (state === "error" || !item) {
    return <div className="empty-demo-state"><p>{message || "Recebível não encontrado."}</p><Link href="/elas-recebem-hoje/painel">Voltar ao painel</Link></div>;
  }

  const canReissue =
    (((item.status === "AWAITING_CLIENT" || item.status === "UNDER_VALIDATION") &&
      (item.confirmationStatus === "PENDING" || item.confirmationStatus === "ACCEPTED")) ||
      ((item.status === "ADVANCED" || item.status === "DUE" || item.status === "DEFAULTED") &&
        item.confirmationStatus === "ACCEPTED"));
  const isPaymentLink =
    item.status === "ADVANCED" || item.status === "DUE" || item.status === "DEFAULTED";
  const delinquencyEligible =
    (item.status === "ADVANCED" || item.status === "DUE") &&
    currentTimeMs >= new Date(item.dueAt).getTime() + 86_400_000;

  return (
    <div className="dashboard">
      <div className="demo-actions">
        <Link className="button button--secondary" href="/elas-recebem-hoje/painel"><ArrowLeft size={16} /> Voltar</Link>
        <button className="button button--secondary" type="button" onClick={() => void load()}><RefreshCw size={16} /> Atualizar</button>
      </div>

      <section className="dashboard-hero">
        <div>
          <span className="eyebrow"><FileCheck2 size={16} /> Elas Recebem Hoje</span>
          <h1>{item.description}</h1>
          <p>Acompanhe o status deste recebível e compartilhe novamente o link do pagador quando necessário.</p>
        </div>
        <div className="dashboard-limit">
          <span>Status atual</span>
          <strong>{statusLabels[item.status] ?? item.status}</strong>
          <small>{formatUsd(item.nominalUsdCents)}</small>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="profile-items">
          <div><strong>Valor</strong><span>{formatUsd(item.nominalUsdCents)}</span></div>
          <div><strong>Vencimento</strong><span>{new Date(item.dueAt).toLocaleDateString("pt-BR")}</span></div>
          <div><strong>Market</strong><span>{item.marketName ?? "Elas Recebem Hoje"}</span></div>
          <div><strong>País do pagador</strong><span>{item.payerCountry}</span></div>
          <div><strong>Confirmação do pagador</strong><span>{item.confirmationStatus ?? "não iniciada"}</span></div>
          <div><strong>Criado em</strong><span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span></div>
          <div><strong>Última atualização</strong><span>{new Date(item.updatedAt).toLocaleString("pt-BR")}</span></div>
        </div>

        {canReissue ? (
          <div className="demo-actions" style={{ marginTop: "1.5rem" }}>
            <button className="button button--secondary" type="button" onClick={() => void reissueLink()}>
              <Link2 size={16} /> {link
                ? isPaymentLink ? "Gerar outro link de pagamento" : "Gerar outro link"
                : isPaymentLink ? "Gerar link de pagamento" : "Gerar link do pagador"}
            </button>
            {link ? (
              <button className="button button--primary" type="button" onClick={() => { void navigator.clipboard.writeText(link); setCopied(true); }}>
                <Copy size={16} /> {copied ? "Copiado" : "Copiar link"}
              </button>
            ) : null}
          </div>
        ) : null}

        {delinquencyEligible ? (
          <div className="confirmation-form" style={{ marginTop: "1.5rem" }}>
            <span className="eyebrow"><AlertTriangle size={16} /> Monitoramento de atraso</span>
            <h2>{item.status === "DUE" ? "Reavaliar atraso do recebível" : "Atualizar estado de pagamento"}</h2>
            <p>
              O GRP registra atraso em D+1 e inadimplência em D+5. Essa transação não move
              fundos; ela apenas atualiza o estado público do recebível e, no default, o Passport.
            </p>
            <button
              className="button button--secondary"
              type="button"
              disabled={delinquencyWorking}
              onClick={() => void processDelinquency()}
            >
              <AlertTriangle size={17} />
              {delinquencyWorking ? "Aguardando carteira…" : item.status === "DUE" ? "Reavaliar atraso" : "Registrar atraso on-chain"}
            </button>
          </div>
        ) : null}

        {item.status === "DEFAULTED" ? (
          <div className="confirmation-form__security" style={{ marginTop: "1.5rem" }}>
            <AlertTriangle size={18} />
            Inadimplência registrada. O pagador ainda pode quitar o recebível pelo link de pagamento; após a liquidação, o GRP registra a cura no histórico.
          </div>
        ) : null}

        {item.status === "APPROVED" ? (
          <div id="criar-oportunidade" className="confirmation-form" style={{ marginTop: "2rem", scrollMarginTop: "7rem" }}>
            <span className="eyebrow"><CircleDollarSign size={16} /> Criar oportunidade</span>
            <h2>Abra este recebível para financiamento.</h2>
            <p>
              Defina quanto deseja antecipar e as condições iniciais da pool. A criação
              será assinada pela sua carteira e registrada na Solana Devnet.
            </p>

            <div className="confirmation-form__grid">
              <label>
                Valor da oportunidade (USD)
                <input value={targetUsd} onChange={(event) => setTargetUsd(event.target.value)} inputMode="decimal" />
              </label>
              <label>
                Prazo para funding
                <input type="date" value={fundingDeadline} onChange={(event) => setFundingDeadline(event.target.value)} />
              </label>
              <label>
                Funding mínimo (%)
                <input type="number" min="0" max="100" value={minimumPartialPercent} onChange={(event) => setMinimumPartialPercent(event.target.value)} />
              </label>
              <label>
                Desconto (%)
                <input type="number" min="0" max="100" step="0.1" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} />
              </label>
            </div>

            <button className="button button--primary" type="button" disabled={poolWorking} onClick={() => void createPool()}>
              <CircleDollarSign size={17} />
              {poolWorking ? "Aguardando carteira…" : "Criar oportunidade na Devnet"}
            </button>
          </div>
        ) : null}

        {item.status === "POOLED" ? (
          <div className="confirmation-form__security" style={{ marginTop: "1.5rem" }}>
            <CircleDollarSign size={18} />
            Oportunidade criada. Este recebível já está disponível para a etapa de funding.
          </div>
        ) : null}

        {message ? <p className="form-error">{message}</p> : null}
      </section>
    </div>
  );
}
