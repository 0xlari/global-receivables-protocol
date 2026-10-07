"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CircleX, RefreshCw, WalletCards } from "lucide-react";
import { PublicKey } from "@solana/web3.js";

import {
  buildRecordValidationTransaction,
  validationDecisionCommitment,
  type BrowserSolanaProvider,
  type GrpValidationDecision,
} from "@/lib/grp-solana";

type AdminReceivable = {
  id: string;
  status: string;
  requesterWallet: string | null;
  nominalUsdCents: string;
  dueAt: string;
  evidenceHash: string | null;
  description: string;
  purpose: string;
  payerCountry: string;
  confirmationStatus: string | null;
  confirmationExpiresAt: string | null;
  createdAt: string;
};

type ReviewState = {
  working?: boolean;
  message?: string;
};

const configuredAuthority = process.env.NEXT_PUBLIC_GRP_ORIGINATOR_WALLET ?? "";

function browserWallet() {
  return (window as Window & { solana?: BrowserSolanaProvider }).solana;
}

function formatUsd(cents: string) {
  return (Number(cents) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
  });
}

export function GrpReceivableAdministration() {
  const [items, setItems] = useState<AdminReceivable[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<Record<string, ReviewState>>({});

  async function refresh() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/grp/admin/receivables", { cache: "no-store" });
      const body = await response.json() as { receivables?: AdminReceivable[]; error?: string };
      if (response.status === 401) {
        window.location.href = "/entrar?next=/administracao/grp";
        return;
      }
      if (response.status === 403) {
        throw new Error("Entre com a carteira authority configurada do GRP.");
      }
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar a fila GRP.");
      setItems(body.receivables ?? []);
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar a fila GRP.");
      setState("error");
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/grp/admin/receivables", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { receivables?: AdminReceivable[]; error?: string };
        if (!active) return;
        if (response.status === 401) {
          window.location.href = "/entrar?next=/administracao/grp";
          return;
        }
        if (response.status === 403) {
          throw new Error("Entre com a carteira authority configurada do GRP.");
        }
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar a fila GRP.");
        setItems(body.receivables ?? []);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar a fila GRP.");
        setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  async function decide(item: AdminReceivable, decision: Exclude<GrpValidationDecision, "NEEDS_INFORMATION">) {
    const reason =
      decision === "APPROVED"
        ? "Aprovado após confirmação do pagador e revisão administrativa GRP."
        : "Rejeitado após revisão administrativa GRP.";

    setReview((current) => ({
      ...current,
      [item.id]: { working: true, message: "" },
    }));

    try {
      if (!item.requesterWallet) {
        throw new Error("A carteira Solana da solicitante não está vinculada.");
      }
      if (!configuredAuthority) {
        throw new Error("A authority do GRP não está configurada neste ambiente.");
      }

      const provider = browserWallet();
      if (!provider?.connect || !provider.signAndSendTransaction) {
        throw new Error("Nenhuma carteira Solana compatível foi encontrada.");
      }

      const connected = await provider.connect();
      const validator = new PublicKey(connected.publicKey.toBase58());
      if (validator.toBase58() !== configuredAuthority) {
        throw new Error("Conecte a carteira authority do GRP para revisar este recebível.");
      }

      const commitment = await validationDecisionCommitment({
        receivableId: item.id,
        decision,
        reason,
      });

      const built = await buildRecordValidationTransaction({
        validator,
        requester: new PublicKey(item.requesterWallet),
        receivableId: item.id,
        decision,
        decisionCommitment: commitment,
        rulesVersion: 1,
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

      const response = await fetch("/api/grp/admin/receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receivableId: item.id,
          decision,
          reason,
          signature: sent.signature,
        }),
      });
      const body = await response.json() as { status?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "A transação confirmou, mas o banco não foi atualizado.");
      }

      setReview((current) => ({
        ...current,
        [item.id]: {
          working: false,
          message: decision === "APPROVED" ? "Recebível aprovado no GRP." : "Recebível rejeitado no GRP.",
        },
      }));
      await refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Não foi possível revisar o recebível.";
      const friendly =
        raw === "GRP_PAYER_AUTHORIZATION_NOT_FOUND_ON_DEVNET"
          ? "O pagador confirmou os dados, mas ainda não concluiu a autorização USDC na Solana Devnet."
          : /simulation|failed to simulate|revert/i.test(raw)
            ? "A Solana recusou a simulação. Confirme se a autorização do pagador foi concluída na Devnet e se a carteira authority possui SOL."
            : raw;

      setReview((current) => ({
        ...current,
        [item.id]: { working: false, message: friendly },
      }));
    }
  }

  if (state === "loading") {
    return <div className="dashboard-loading">Carregando fila de validação GRP…</div>;
  }

  return (
    <section className="admin-demo">
      <div className="admin-demo__toolbar">
        <div>
          <span className="kicker">GRP · Fila de validação</span>
          <h2>Recebíveis aguardando decisão</h2>
        </div>
        <button className="button button--secondary" type="button" onClick={() => void refresh()}>
          <RefreshCw size={17} /> Atualizar
        </button>
      </div>

      {message ? <p className="form-error">{message}</p> : null}

      {state === "error" ? null : items.length === 0 ? (
        <div className="empty-demo-state">Nenhum recebível aguarda validação.</div>
      ) : (
        <div className="admin-demo__list">
          {items.map((item) => {
            const current = review[item.id] ?? {};
            return (
              <article key={item.id}>
                <div className="admin-demo__status">
                  <span className="tag tag--soft">Em validação</span>
                  <small>{item.id}</small>
                </div>

                <h3>{item.description}</h3>

                <dl>
                  <div><dt>Valor</dt><dd>{formatUsd(item.nominalUsdCents)}</dd></div>
                  <div><dt>Vencimento</dt><dd>{new Date(item.dueAt).toLocaleDateString("pt-BR")}</dd></div>
                  <div><dt>Pagador</dt><dd>{item.payerCountry}</dd></div>
                  <div><dt>Confirmação</dt><dd>{item.confirmationStatus ?? "não encontrada"}</dd></div>
                  <div><dt>Solicitante</dt><dd><code>{item.requesterWallet ? item.requesterWallet.slice(0, 8) + "…" + item.requesterWallet.slice(-6) : "sem wallet"}</code></dd></div>
                  <div><dt>Evidência</dt><dd><code>{item.evidenceHash ? item.evidenceHash.slice(0, 12) + "…" : "sem hash"}</code></dd></div>
                </dl>

                <div className="confirmation-form__security">
                  <WalletCards size={18} />
                  A decisão será assinada pela authority do GRP e registrada na Solana Devnet.
                </div>

                <div className="demo-actions">
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={current.working || item.confirmationStatus !== "ACCEPTED"}
                    onClick={() => void decide(item, "APPROVED")}
                  >
                    <BadgeCheck size={17} />
                    {current.working ? "Aguardando carteira…" : "Aprovar no GRP"}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={current.working}
                    onClick={() => void decide(item, "REJECTED")}
                  >
                    <CircleX size={17} /> Rejeitar
                  </button>
                </div>

                {item.confirmationStatus !== "ACCEPTED" ? (
                  <p>O pagador precisa confirmar o recebível antes da aprovação.</p>
                ) : null}
                {current.message ? <p role="status">{current.message}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
