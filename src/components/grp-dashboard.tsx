"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FilePlus2, RefreshCw, WalletCards } from "lucide-react";

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

  async function load() {
    setState("loading");
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
    void load();
  }, []);

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
            {items.map((item) => (
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
              </div>
            ))}
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
