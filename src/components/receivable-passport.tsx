"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  History,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type PassportResponse = {
  passport: null | {
    receivablesCreated: string;
    receivablesSettled: string;
    settledOnTime: string;
    settledLate: string;
    defaults: string;
    defaultsCured: string;
    totalSettledAmountUsdcMinor: string;
    onTimeRateBps: number | null;
    lastUpdatedAt: string | null;
  };
  passportPda: string;
  subject: string;
  network: string;
  history: Array<{
    id: string;
    description: string;
    status: string;
    nominalUsdCents: string;
    dueAt: string;
    updatedAt: string;
    marketName: string | null;
    marketSlug: string | null;
  }>;
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

function moneyFromUsdcMinor(value: string) {
  return (Number(value) / 1_000_000).toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
  });
}

function moneyFromCents(value: string) {
  return (Number(value) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
  });
}

function shortKey(value: string) {
  if (value.length < 16) return value;
  return value.slice(0, 7) + "…" + value.slice(-7);
}

export function ReceivablePassport() {
  const [data, setData] = useState<PassportResponse>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  async function load() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/grp/passport", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(
          "/elas-recebem-hoje/entrar?next=/elas-recebem-hoje/passaporte",
        );
        return;
      }

      const body = (await response.json()) as PassportResponse;
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o Passport.");

      setData(body);
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar o Passport.");
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    if (!data?.passport) return null;
    const p = data.passport;
    const defaults = BigInt(p.defaults);
    const cured = BigInt(p.defaultsCured);
    return {
      onTimeRate: p.onTimeRateBps === null ? "—" : (p.onTimeRateBps / 100).toFixed(1) + "%",
      curedRate:
        defaults === 0n
          ? "—"
          : ((Number(cured) / Number(defaults)) * 100).toFixed(0) + "%",
    };
  }, [data]);

  if (state === "loading") {
    return <div className="dashboard-loading">Carregando seu Receivable Passport…</div>;
  }

  if (state === "error" || !data) {
    return (
      <div className="empty-demo-state">
        <p>{message || "Não foi possível carregar o Passport."}</p>
        <button className="button button--secondary" type="button" onClick={() => void load()}>
          <RefreshCw size={17} /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow"><History size={16} /> Receivable Passport</span>
          <h1>Seu histórico financeiro portátil.</h1>
          <p>
            O GRP transforma o comportamento dos seus recebíveis em histórico verificável.
            Pagamentos no prazo, atrasos e defaults curados permanecem associados à sua carteira,
            independentemente do Market usado.
          </p>
        </div>

        <div className="dashboard-limit">
          <span>Identidade on-chain</span>
          <strong>{shortKey(data.subject)}</strong>
          <small>{data.network} · Passport PDA {shortKey(data.passportPda)}</small>
        </div>
      </section>

      {!data.passport ? (
        <section className="dashboard-section">
          <div className="empty-demo-state">
            <ShieldCheck size={30} />
            <h2>Seu Passport ainda não possui estado on-chain.</h2>
            <p>
              Ele passa a acumular histórico quando você cria e liquida recebíveis pelo GRP.
            </p>
            <Link className="button button--primary" href="/elas-recebem-hoje/recebivel">
              Criar recebível
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="dashboard-section">
            <div className="dashboard-section__heading">
              <div>
                <span className="kicker">Sinais verificáveis</span>
                <h2>Performance registrada no GRP</h2>
              </div>
              <button className="button button--secondary" type="button" onClick={() => void load()}>
                <RefreshCw size={16} /> Atualizar
              </button>
            </div>

            <div className="profile-items">
              <div>
                <strong>Recebíveis criados</strong>
                <span>{data.passport.receivablesCreated}</span>
                <small>Operações registradas neste Passport.</small>
              </div>
              <div>
                <strong>Recebíveis liquidados</strong>
                <span>{data.passport.receivablesSettled}</span>
                <small>Liquidações concluídas e incorporadas ao histórico.</small>
              </div>
              <div>
                <strong>Liquidados no prazo</strong>
                <span>{data.passport.settledOnTime}</span>
                <small>Taxa de pontualidade: {summary?.onTimeRate}</small>
              </div>
              <div>
                <strong>Liquidados com atraso</strong>
                <span>{data.passport.settledLate}</span>
                <small>Atrasos permanecem visíveis como sinal de comportamento.</small>
              </div>
              <div>
                <strong>Defaults registrados</strong>
                <span>{data.passport.defaults}</span>
                <small>Eventos de inadimplência registrados on-chain.</small>
              </div>
              <div>
                <strong>Defaults curados</strong>
                <span>{data.passport.defaultsCured}</span>
                <small>Taxa de cura: {summary?.curedRate}</small>
              </div>
              <div>
                <strong>Volume liquidado</strong>
                <span>{moneyFromUsdcMinor(data.passport.totalSettledAmountUsdcMinor)}</span>
                <small>USDC liquidado e incorporado ao Passport.</small>
              </div>
              <div>
                <strong>Última atualização</strong>
                <span>
                  {data.passport.lastUpdatedAt
                    ? new Date(data.passport.lastUpdatedAt).toLocaleString("pt-BR")
                    : "—"}
                </span>
                <small>Atualização proveniente do estado on-chain.</small>
              </div>
            </div>

            <div className="confirmation-form__security" style={{ marginTop: "1.5rem" }}>
              <BadgeCheck size={18} />
              O Passport registra sinais financeiros públicos, não documentos ou evidências privadas.
              Os comprovantes continuam fora da blockchain.
            </div>
          </section>

          <section className="dashboard-section">
            <div className="dashboard-section__heading">
              <div>
                <span className="kicker">Linha do tempo</span>
                <h2>Recebíveis que constroem sua reputação</h2>
              </div>
            </div>

            {data.history.length ? (
              <div className="profile-items">
                {data.history.map((item) => (
                  <div key={item.id}>
                    <strong>{item.description}</strong>
                    <span>
                      {moneyFromCents(item.nominalUsdCents)} · {statusLabels[item.status] ?? item.status}
                    </span>
                    <span>
                      {item.marketName ?? "GRP"} · vencimento{" "}
                      {new Date(item.dueAt).toLocaleDateString("pt-BR")}
                    </span>
                    <small>
                      Atualizado em {new Date(item.updatedAt).toLocaleString("pt-BR")}
                    </small>
                    {item.marketSlug === "elas-recebem-hoje" ? (
                      <Link href={"/elas-recebem-hoje/recebivel/" + item.id}>
                        Ver recebível <ExternalLink size={14} style={{ display: "inline" }} />
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-demo-state">
                <Clock3 size={26} />
                <p>Nenhum recebível foi registrado ainda.</p>
              </div>
            )}
          </section>

          <section className="dashboard-section">
            <div className="confirmation-form">
              <span className="eyebrow"><CircleDollarSign size={16} /> Por que isso importa</span>
              <h2>Um histórico que pode atravessar Markets.</h2>
              <p>
                O Market pode mudar, mas o Passport permanece ligado à mesma carteira. Isso cria
                uma base para regras futuras de risco, limites, pricing e acesso a liquidez sem
                reconstruir reputação do zero em cada aplicação.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
