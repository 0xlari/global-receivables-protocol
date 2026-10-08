"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CircleAlert,
  CircleX,
  RefreshCw,
  RotateCw,
  WalletCards,
} from "lucide-react";
import { PublicKey } from "@solana/web3.js";

import {
  buildRecordValidationTransaction,
  validationDecisionCommitment,
  type BrowserSolanaProvider,
  type GrpValidationDecision,
} from "@/lib/grp-solana";

type OnchainReviewState = {
  receivablePda: string | null;
  payerAuthorizationPda: string | null;
  validationPda: string | null;
  receivableExists: boolean;
  payerAuthorizationExists: boolean;
  validationExists: boolean;
  validationDecision: GrpValidationDecision | null;
  readyForValidation: boolean;
};

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
  marketName?: string | null;
  marketSlug?: string | null;
  onchain: OnchainReviewState;
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

function short(value: string | null | undefined) {
  if (!value) return "—";
  return value.slice(0, 8) + "…" + value.slice(-6);
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
        window.location.assign("/entrar?next=/administracao/grp");
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
          window.location.assign("/entrar?next=/administracao/grp");
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

  async function syncDecision(
    item: AdminReceivable,
    decision: Exclude<GrpValidationDecision, "NEEDS_INFORMATION">,
    reason: string,
  ) {
    const response = await fetch("/api/grp/admin/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receivableId: item.id,
        decision,
        reason,
        reconcile: true,
      }),
    });
    const body = await response.json() as { status?: string; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Não foi possível sincronizar a decisão on-chain.");
  }

  async function decide(
    item: AdminReceivable,
    decision: Exclude<GrpValidationDecision, "NEEDS_INFORMATION">,
  ) {
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

      if (
        item.onchain.validationExists &&
        item.onchain.validationDecision === decision
      ) {
        await syncDecision(item, decision, reason);
        setReview((current) => ({
          ...current,
          [item.id]: { working: false, message: "Estado on-chain sincronizado com o banco." },
        }));
        await refresh();
        return;
      }

      if (!item.onchain.receivableExists) {
        throw new Error("O recebível não foi encontrado na Solana Devnet.");
      }
      if (!item.onchain.payerAuthorizationExists) {
        throw new Error(
          "O pagador confirmou os dados, mas ainda não concluiu a autorização USDC on-chain.",
        );
      }
      if (item.onchain.validationExists) {
        throw new Error(
          "Já existe uma decisão on-chain diferente para este recebível. Atualize a fila antes de continuar.",
        );
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
        throw new Error(
          body.error ?? "A transação confirmou, mas o banco ainda não foi sincronizado.",
        );
      }

      setReview((current) => ({
        ...current,
        [item.id]: {
          working: false,
          message:
            decision === "APPROVED"
              ? "Recebível aprovado on-chain e sincronizado."
              : "Recebível rejeitado on-chain e sincronizado.",
        },
      }));
      await refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Não foi possível revisar o recebível.";
      const friendly =
        raw === "GRP_PAYER_AUTHORIZATION_NOT_FOUND_ON_DEVNET"
          ? "O pagador confirmou os dados, mas ainda não concluiu a autorização USDC na Solana Devnet."
          : raw === "GRP_VALIDATION_STATE_NOT_FOUND_ONCHAIN"
            ? "A transação foi enviada, mas o estado de validação ainda não apareceu na Devnet. Clique em Atualizar; se a decisão já estiver on-chain, o botão mudará para Sincronizar."
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
            const chainApproved =
              item.onchain.validationExists &&
              item.onchain.validationDecision === "APPROVED";
            const ready =
              item.confirmationStatus === "ACCEPTED" &&
              item.onchain.readyForValidation;
            const missingAuthorization =
              item.confirmationStatus === "ACCEPTED" &&
              !item.onchain.payerAuthorizationExists;

            return (
              <article key={item.id}>
                <div className="admin-demo__status">
                  <span className="tag tag--soft">Em validação</span>
                  <small>{item.marketName ?? "GRP"} · {item.id}</small>
                </div>

                <h3>{item.description}</h3>

                <dl>
                  <div><dt>Valor</dt><dd>{formatUsd(item.nominalUsdCents)}</dd></div>
                  <div><dt>Vencimento</dt><dd>{new Date(item.dueAt).toLocaleDateString("pt-BR")}</dd></div>
                  <div><dt>Market</dt><dd>{item.marketName ?? "não identificado"}</dd></div>
                  <div><dt>Pagador</dt><dd>{item.payerCountry}</dd></div>
                  <div><dt>Confirmação off-chain</dt><dd>{item.confirmationStatus ?? "não encontrada"}</dd></div>
                  <div><dt>Recebível Devnet</dt><dd>{item.onchain.receivableExists ? "encontrado" : "não encontrado"}</dd></div>
                  <div><dt>Autorização USDC</dt><dd>{item.onchain.payerAuthorizationExists ? "on-chain" : "pendente"}</dd></div>
                  <div><dt>Validação on-chain</dt><dd>{item.onchain.validationDecision ?? "ainda não registrada"}</dd></div>
                  <div><dt>Solicitante</dt><dd><code>{short(item.requesterWallet)}</code></dd></div>
                  <div><dt>Validation PDA</dt><dd><code>{short(item.onchain.validationPda)}</code></dd></div>
                </dl>

                {chainApproved ? (
                  <div className="confirmation-form__security">
                    <RotateCw size={18} />
                    A aprovação já existe na Devnet. Falta apenas sincronizar o banco.
                  </div>
                ) : ready ? (
                  <div className="confirmation-form__security">
                    <WalletCards size={18} />
                    Recebível e autorização do pagador encontrados na Devnet. Pronto para decisão.
                  </div>
                ) : (
                  <div className="confirmation-form__security">
                    <CircleAlert size={18} />
                    {missingAuthorization
                      ? "A confirmação foi aceita no banco, mas a autorização USDC do pagador ainda não existe on-chain."
                      : "Este recebível ainda não está pronto para validação on-chain."}
                  </div>
                )}

                <div className="demo-actions">
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={
                      current.working ||
                      item.confirmationStatus !== "ACCEPTED" ||
                      (!ready && !chainApproved)
                    }
                    onClick={() => void decide(item, "APPROVED")}
                  >
                    <BadgeCheck size={17} />
                    {current.working
                      ? "Processando…"
                      : chainApproved
                        ? "Sincronizar aprovação"
                        : "Aprovar no GRP"}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={
                      current.working ||
                      item.confirmationStatus !== "ACCEPTED" ||
                      !ready
                    }
                    onClick={() => void decide(item, "REJECTED")}
                  >
                    <CircleX size={17} /> Rejeitar
                  </button>
                </div>

                {current.message ? <p role="status">{current.message}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
