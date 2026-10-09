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
  marketId?: string | null;
  marketSlug?: string | null;
  marketName?: string | null;
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
  POOLED: "Oportunidade aberta",
  ADVANCED: "Antecipado",
  DUE: "Em atraso",
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

export function GrpDashboard({
  experience = "GRP",
  createHref = "/recebivel",
  loginHref = "/entrar?next=/painel",
}: {
  experience?: "GRP" | "ERH";
  createHref?: string;
  loginHref?: string;
} = {}) {
  const [items, setItems] = useState<GrpReceivable[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState<Record<string, LinkState>>({});

  async function load(showLoading = true) {
    if (showLoading) setState("loading");
    setMessage("");
    try {
      const response = await fetch(experience === "ERH" ? "/api/grp/receivables?market=elas-recebem-hoje" : "/api/grp/receivables", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = loginHref;
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
    fetch(experience === "ERH" ? "/api/grp/receivables?market=elas-recebem-hoje" : "/api/grp/receivables", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = loginHref;
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
  }, [experience, loginHref]);

  async function issueLink(receivableId: string) {
    setLinks((current) => ({
      ...current,
      [receivableId]: { ...current[receivableId], loading: true, error: "", copied: false },
    }));
    try {
      const response = await fetch(
        `/api/grp/receivables/${receivableId}/confirmation-link${experience === "ERH" ? "?experience=erh" : ""}`,
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
    return (
      <div className="dashboard-loading">
        {experience === "ERH" ? "Carregando seus recebíveis…" : "Carregando seus recebíveis GRP…"}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow"><WalletCards size={16} /> {experience === "ERH" ? "Elas Recebem Hoje" : "Global Receivables Protocol"}</span>
          <h1>{experience === "ERH" ? "Seus recebíveis." : "Seus recebíveis no GRP."}</h1>
          <p>
            {experience === "ERH"
              ? "Acompanhe seus recebíveis desde a criação até a confirmação do pagador, validação, financiamento e liquidação."
              : "Acompanhe o estado do recebível desde a criação até a confirmação do pagador, validação, financiamento e liquidação."}
          </p>
        </div>
        <div className="dashboard-limit">
          <span>Recebíveis registrados</span>
          <strong>{items.length}</strong>
          <small>{experience === "ERH"
            ? "Seus dados privados permanecem protegidos; a infraestrutura GRP registra o estado financeiro necessário."
            : "Dados privados no banco + estado financeiro verificável no GRP."}</small>
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
            <Link className="button button--primary" href={createHref}>
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
                ((item.status === "AWAITING_CLIENT" || item.status === "UNDER_VALIDATION") &&
                  (item.confirmationStatus === "PENDING" || item.confirmationStatus === "ACCEPTED")) ||
                ((item.status === "ADVANCED" || item.status === "DUE" || item.status === "DEFAULTED") &&
                  item.confirmationStatus === "ACCEPTED");
              const isPaymentLink =
                item.status === "ADVANCED" || item.status === "DUE" || item.status === "DEFAULTED";

              return (
                <div key={item.id}>
                  {experience === "ERH" ? (
                    <Link href={"/elas-recebem-hoje/recebivel/" + item.id}><strong>{item.description}</strong></Link>
                  ) : (
                    <strong>{item.description}</strong>
                  )}
                  <span>
                    {formatUsd(item.nominalUsdCents)} · {statusLabels[item.status] ?? item.status}
                  </span>
                  <span>
                    {experience === "GRP" && item.marketName ? item.marketName + " · " : ""}
                    Vencimento {new Date(item.dueAt).toLocaleDateString("pt-BR")}
                    {item.confirmationStatus
                      ? " · confirmação: " + (item.confirmationStatus === "PENDING" ? "pendente" : item.confirmationStatus.toLowerCase())
                      : ""}
                  </span>

                  {experience === "ERH" && item.status === "APPROVED" ? (
                    <>
                      <small>
                        Próximo passo: abra uma oportunidade para buscar liquidez para este recebível.
                      </small>
                      <div className="demo-actions">
                        <Link
                          className="button button--primary"
                          href={"/elas-recebem-hoje/recebivel/" + item.id + "#criar-oportunidade"}
                        >
                          Criar oportunidade <ArrowRight size={16} />
                        </Link>
                      </div>
                    </>
                  ) : null}

                  {experience === "ERH" && item.status === "POOLED" ? (
                    <>
                      <small>
                        Sua oportunidade já está aberta para funding.
                      </small>
                      <div className="demo-actions">
                        <Link
                          className="button button--primary"
                          href="/elas-recebem-hoje/oportunidades"
                        >
                          Ver oportunidade <ArrowRight size={16} />
                        </Link>
                      </div>
                    </>
                  ) : null}

                  {experience === "ERH" && item.status === "ADVANCED" ? (
                    <>
                      <small>
                        Antecipação recebida. Próximo passo: enviar o link de pagamento ao pagador para liquidar o recebível.
                      </small>
                    </>
                  ) : null}

                  {experience === "ERH" && item.status === "DUE" ? (
                    <small>
                      Pagamento em atraso. Reenvie o link ao pagador e acompanhe a atualização on-chain.
                    </small>
                  ) : null}

                  {experience === "ERH" && item.status === "DEFAULTED" ? (
                    <small>
                      Inadimplência registrada. O pagamento continua disponível e pode curar o default no histórico do GRP.
                    </small>
                  ) : null}

                  {canIssueLink ? (
                    <div className="demo-actions">
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={linkState.loading}
                        onClick={() => void issueLink(item.id)}
                      >
                        <Link2 size={16} />
                        {linkState.loading
                          ? "Gerando…"
                          : linkState.url
                            ? isPaymentLink
                              ? "Gerar outro link de pagamento"
                              : "Gerar outro link"
                            : isPaymentLink
                              ? "Gerar link de pagamento"
                              : "Gerar link do pagador"}
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
                      {isPaymentLink
                        ? "Envie este link ao pagador para a liquidação em USDC. Se você gerar outro, o anterior deixa de funcionar."
                        : "O link foi reemitido por segurança. Se você gerar outro, o anterior deixa de funcionar."}
                    </small>
                  ) : null}
                  {linkState.error ? <small className="form-error">{linkState.error}</small> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-demo-state">
            <p>{experience === "ERH"
              ? "Você ainda não criou nenhum recebível."
              : "Você ainda não criou nenhum recebível no GRP."}</p>
            <Link className="button button--primary" href={createHref}>
              Criar o primeiro recebível <ArrowRight size={17} />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
