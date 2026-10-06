"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Copy,
  ExternalLink,
  FilePlus2,
  Link2,
  RefreshCw,
  WalletCards,
} from "lucide-react";

type GrpReceivable = {
  id: string;
  status: string;
  description: string;
  purpose: string;
  nominalUsdCents: string;
  dueAt: string;
  createdAt: string;
  updatedAt: string;
  confirmationStatus: string | null;
  confirmationExpiresAt: string | null;
};

type LinkState = {
  url?: string;
  loading?: boolean;
  copied?: boolean;
  error?: string;
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
  DUE: "Aguardando liquidação",
  PAID: "Pago",
  DEFAULTED: "Inadimplente",
  CLOSED: "Concluído",
};

function formatUsd(cents: string) {
  return (Number(cents) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
  });
}

export function GrpDashboard() {
  const [items, setItems] = useState<GrpReceivable[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState<Record<string, LinkState>>({});

  async function load(showLoading = true) {
    if (showLoading) setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/grp/receivables", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/entrar?next=/painel";
        return;
      }
      const body = await response.json() as { receivables?: GrpReceivable[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar seus recebíveis.");
      setItems(body.receivables ?? []);
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar seus recebíveis.");
      setState("error");
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/grp/receivables", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = "/entrar?next=/painel";
          return;
        }
        const body = await response.json() as { receivables?: GrpReceivable[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar seus recebíveis.");
        if (!active) return;
        setItems(body.receivables ?? []);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar seus recebíveis.");
        setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  async function issueLink(receivableId: string) {
    setLinks((current) => ({
      ...current,
      [receivableId]: { ...current[receivableId], loading: true, error: "", copied: false },
    }));
    try {
      const response = await fetch(
        \`/api/grp/receivables/\${receivableId}/confirmation-link\`,
        { method: "POST" },
      );
      const body = await response.json() as { confirmationUrl?: string; error?: string };
      if (!response.ok || !body.confirmationUrl) {
        throw new Error(body.error ?? "Não foi possível gerar o link.");
      }
      setLinks((current) => ({
        ...current,
        [receivableId]: { url: body.confirmationUrl, loading: false },
      }));
    } catch (error) {
      setLinks((current) => ({
        ...current,
        [receivableId]: {
          ...current[receivableId],
          loading: false,
          error: error instanceof Error ? error.message : "Não foi possível gerar o link.",
        },
      }));
    }
  }

  async function copyLink(receivableId: string, url: string) {
    await navigator.clipboard.writeText(url);
    setLinks((current) => ({
      ...current,
      [receivableId]: { ...current[receivableId], copied: true },
    }));
  }

  if (state === "loading") {
    return <div className="dashboard-loading">Carregando seus recebíveis GRP…</div>;
  }

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow"><WalletCards size={16} /> Global Receivables Protocol</span>
          <h1>Seus recebíveis no GRP.</h1>
          <p>
            Acompanhe o estado do recebível desde a criação até a confirmação do pagador,
            validação, financiamento e liquidação.
          </p>
        </div>
        <div className="dashboard-limit">
          <span>Recebíveis registrados</span>
          <strong>{items.length}</strong>
          <small>Dados privados no banco + estado financeiro verificável no GRP.</small>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__heading">
          <div>
            <span className="kicker">Meus recebíveis</span>
            <h2>Solicitações criadas</h2>
          </div>
          <div className="demo-actions">
            <button className="button button--secondary" type="button" onClick={() => void load()}>
              <RefreshCw size={16} /> Atualizar
            </button>
            <Link className="button button--primary" href="/recebivel">
              <FilePlus2 size={17} /> Criar recebível
            </Link>
          </div>
        </div>

        {state === "error" ? <p className="form-error">{message}</p> : null}

        {items.length ? (
          <div className="profile-items">
            {items.map((item) => {
              const linkState = links[item.id] ?? {};
              const canIssueLink =
                (item.status === "AWAITING_CLIENT" || item.status === "UNDER_VALIDATION") &&
                (item.confirmationStatus === "PENDING" || item.confirmationStatus === "ACCEPTED");

              return (
                <div key={item.id}>
                  <strong>{item.description}</strong>
                  <span>
                    {formatUsd(item.nominalUsdCents)} · {statusLabels[item.status] ?? item.status}
                  </span>
                  <span>
                    Vencimento {new Date(item.dueAt).toLocaleDateString("pt-BR")}
                    {item.confirmationStatus
                      ? " · confirmação: " + (item.confirmationStatus === "PENDING" ? "pendente" : item.confirmationStatus.toLowerCase())
                      : ""}
                  </span>

                  {canIssueLink ? (
                    <div className="demo-actions">
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={linkState.loading}
                        onClick={() => void issueLink(item.id)}
                      >
                        <Link2 size={16} />
                        {linkState.loading ? "Gerando…" : linkState.url ? "Gerar outro link" : "Gerar link do pagador"}
                      </button>

                      {linkState.url ? (
                        <>
                          <button
                            className="button button--secondary"
                            type="button"
                            onClick={() => void copyLink(item.id, linkState.url!)}
                          >
                            <Copy size={16} /> {linkState.copied ? "Copiado" : "Copiar link"}
                          </button>
                          <a
                            className="button button--primary"
                            href={linkState.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir link <ExternalLink size={16} />
                          </a>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {linkState.url ? (
                    <small>
                      O link foi reemitido por segurança. Se você gerar outro, o anterior deixa de funcionar.
                    </small>
                  ) : null}
                  {linkState.error ? <small className="form-error">{linkState.error}</small> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-demo-state">
            <p>Você ainda não criou nenhum recebível no GRP.</p>
            <Link className="button button--primary" href="/recebivel">
              Criar o primeiro recebível <ArrowRight size={17} />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
