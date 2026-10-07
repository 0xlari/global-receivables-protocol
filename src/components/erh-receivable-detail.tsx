"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, FileCheck2, Link2, RefreshCw } from "lucide-react";

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
  return (Number(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "USD" });
}

export function ErhReceivableDetail({ receivableId }: { receivableId: string }) {
  const [item, setItem] = useState<Receivable>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  async function load() {
    setState("loading");
    try {
      const response = await fetch("/api/grp/receivables/" + receivableId, { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/elas-recebem-hoje/entrar?next=/elas-recebem-hoje/recebivel/" + receivableId;
        return;
      }
      const body = await response.json() as { receivable?: Receivable; error?: string };
      if (!response.ok || !body.receivable) throw new Error(body.error ?? "Não foi possível carregar este recebível.");
      if (body.receivable.marketSlug && body.receivable.marketSlug !== "elas-recebem-hoje") {
        throw new Error("Este recebível pertence a outro Market do GRP.");
      }
      setItem(body.receivable);
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar este recebível.");
      setState("error");
    }
  }

  useEffect(() => {
    void load();
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

  if (state === "loading") return <div className="dashboard-loading">Carregando recebível…</div>;

  if (state === "error" || !item) {
    return <div className="empty-demo-state"><p>{message || "Recebível não encontrado."}</p><Link href="/elas-recebem-hoje/painel">Voltar ao painel</Link></div>;
  }

  const canReissue =
    (item.status === "AWAITING_CLIENT" || item.status === "UNDER_VALIDATION") &&
    (item.confirmationStatus === "PENDING" || item.confirmationStatus === "ACCEPTED");

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
              <Link2 size={16} /> {link ? "Gerar outro link" : "Gerar link do pagador"}
            </button>
            {link ? (
              <button className="button button--primary" type="button" onClick={() => { void navigator.clipboard.writeText(link); setCopied(true); }}>
                <Copy size={16} /> {copied ? "Copiado" : "Copiar link"}
              </button>
            ) : null}
          </div>
        ) : null}

        {message ? <p className="form-error">{message}</p> : null}
      </section>
    </div>
  );
}
