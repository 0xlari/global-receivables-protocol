"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, Bitcoin, BriefcaseBusiness, Copy, ExternalLink, FilePlus2, Fingerprint, FlaskConical, Link2, Radio, ShieldCheck, Users } from "lucide-react";

import { ButtonLink } from "@/components/button-link";
import { LrpPoolCreation } from "@/components/lrp-pool-creation";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import { DEMO_CHANGED_EVENT, getDemoState, type DemoContribution, type DemoReceivable } from "@/lib/demo-store";
import type { LrpProductReceivable } from "@/services/lrp-product-read-service";

type AccessState = "checking" | "authenticated" | "anonymous";
type LrpHistoryState = "idle" | "loading" | "ready" | "unavailable";

const privateStatusLabels: Record<string, string> = {
  DRAFT: "Cadastro iniciado",
  AWAITING_CLIENT: "Aguardando confirmação do pagador",
  UNDER_VALIDATION: "Em análise pela plataforma",
  NEEDS_CORRECTION: "Correção necessária",
  APPROVED: "Recebível aprovado",
  POOLED: "Pool criada",
  ADVANCED: "Antecipação registrada",
  DUE: "Pagamento próximo do vencimento",
  PAID: "Pagamento recebido",
  DEFAULTED: "Pagamento em atraso",
  CLOSED: "Recebível concluído",
  REJECTED: "Recebível não aprovado",
};

function nextAction(item: LrpProductReceivable) {
  if (item.nextStep === "VIEW_POOL" && item.pool) return { href: `/pools/${item.pool.poolId}`, label: "Ver pool" };
  if (item.nextStep === "CREATE_POOL") return { href: "#criar-pool", label: "Revisar termos e criar pool" };
  if (item.nextStep === "REVIEW_POOL") return { href: "#criar-pool", label: "Revisar e criar pool" };
  if (item.nextStep === "AWAIT_REVIEW") return { href: "/recebivel", label: "Acompanhar análise" };
  if (item.nextStep === "SHARE_CONFIRMATION" || item.nextStep === "AWAIT_PAYER") return { href: "/recebivel", label: "Abrir recebível" };
  return { href: "/recebivel", label: "Continuar recebível" };
}

const missions = [
  { icon: Fingerprint, title: "Confirmar identidade", detail: "Aumenta a confiança sem expor seus documentos." },
  { icon: Link2, title: "Conectar LinkedIn", detail: "Autorize a verificação da sua trajetória profissional." },
  { icon: Radio, title: "Conectar rede profissional", detail: "Adicione outro sinal consentido ao seu perfil." },
  { icon: BriefcaseBusiness, title: "Concluir um recebível", detail: "Operações pagas fortalecem seu histórico interno." },
  { icon: Bitcoin, title: "Adicionar garantia em BTC", detail: "Cada US$ 1 elegível pode sustentar até US$ 2 de limite." },
];

export function AuthenticatedDashboard({ lrpMode = "LEGACY" }: { lrpMode?: LrpOriginationMode }) {
  const [access, setAccess] = useState<AccessState>("checking");
  const [profile, setProfile] = useState<{ id: string; label: string }>();
  const [receivables, setReceivables] = useState<DemoReceivable[]>([]);
  const [contributions, setContributions] = useState<DemoContribution[]>([]);
  const [lrpJourney, setLrpJourney] = useState<{ active?: LrpProductReceivable; history: LrpProductReceivable[] }>({ history: [] });
  const [lrpHistoryState, setLrpHistoryState] = useState<LrpHistoryState>("idle");
  const [productMode, setProductMode] = useState<LrpOriginationMode>(lrpMode);
  const [productSourceResolved, setProductSourceResolved] = useState(false);
  const [confirmationCopied, setConfirmationCopied] = useState(false);
  const [poolOverrides, setPoolOverrides] = useState<Record<string, LrpProductReceivable["pool"]>>({});
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.ok) {
          const body = await response.json() as { profile?: { id: string; label: string } };
          if (!body.profile?.id) throw new Error("SESSION_PROFILE_MISSING");
          setProfile(body.profile);
          setAccess("authenticated");
        }
        else {
          setAccess("anonymous");
          router.replace("/entrar?next=/painel");
        }
      })
      .catch(() => {
        if (!active) return;
        setAccess("anonymous");
        router.replace("/entrar?next=/painel");
      });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    const refresh = () => {
      const state = getDemoState(profile.id);
      setReceivables(state.receivables);
      setContributions(state.contributions);
    };
    fetch("/api/receivables", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("LRP_HISTORY_UNAVAILABLE");
      const body = await response.json() as { source: LrpOriginationMode; active?: LrpProductReceivable; history?: LrpProductReceivable[] };
      if (!active) return;
      setProductMode(body.source);
      if (body.source === "LRP") {
        setReceivables([]);
        setContributions([]);
        setLrpJourney({ active: body.active, history: body.history ?? [] });
        setLrpHistoryState("ready");
        setProductSourceResolved(true);
        return;
      }
      refresh();
      setLrpHistoryState("idle");
      setProductSourceResolved(true);
      window.addEventListener(DEMO_CHANGED_EVENT, refresh);
    }).catch(() => {
      if (!active) return;
      if (lrpMode === "LRP") {
        setLrpHistoryState("unavailable");
        setProductSourceResolved(true);
      }
      else {
        setProductMode(lrpMode);
        refresh();
        setLrpHistoryState("idle");
        setProductSourceResolved(true);
        window.addEventListener(DEMO_CHANGED_EVENT, refresh);
      }
    });
    return () => { active = false; window.removeEventListener(DEMO_CHANGED_EVENT, refresh); };
  }, [lrpMode, profile]);

  if (access !== "authenticated") {
    return <div className="dashboard-loading" role="status">{access === "checking" ? "Confirmando sua carteira…" : "Redirecionando para o acesso…"}</div>;
  }
  if (!productSourceResolved) return <div className="dashboard-loading" role="status">Carregando seus registros…</div>;

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow"><BadgeCheck aria-hidden="true" size={16} /> Carteira conectada · {profile?.label}</span>
          <h1>O que você quer fazer hoje?</h1>
          <p>Crie um recebível para antecipar ou encontre uma pool BTC para aportar.</p>
        </div>
        <div className="dashboard-limit" aria-label="Limite atual">
          <span>Seu limite inicial</span>
          <strong>US$ 100</strong>
          <small>Complete missões para chegar a US$ 5 mil. Garantias em BTC podem elevar o limite além disso.</small>
        </div>
      </section>

      <section className="dashboard-actions" aria-label="Ações principais">
        <article>
          <FilePlus2 aria-hidden="true" />
          <span className="kicker">Tenho a receber</span>
          <h2>Criar recebível</h2>
          <p>Cadastre salário, venda, comissão, serviço ou outro pagamento legítimo do exterior.</p>
          <ButtonLink href="/recebivel">Começar cadastro</ButtonLink>
        </article>
        <article>
          <Users aria-hidden="true" />
          <span className="kicker">Quero aportar</span>
          <h2>Ver pools abertas</h2>
          <p>Compare prazo, cobertura e risco antes de assumir uma participação em BTC.</p>
          <ButtonLink href="/pools" variant="secondary">Explorar pools</ButtonLink>
        </article>
      </section>

      <section className="profile-history" aria-label="Seu histórico na plataforma">
        <article>
          <div><span className="kicker">Meus recebíveis</span>{productMode === "LRP" ? lrpHistoryState === "unavailable" ? <><h2>Histórico indisponível</h2><p>Não foi possível carregar seu histórico agora. Nenhum dado local foi usado como substituto.</p></> : lrpHistoryState !== "ready" ? <><h2>Carregando seu histórico</h2><p>Consultando os registros da plataforma.</p></> : lrpJourney.history.length ? <div className="profile-items">{lrpJourney.history
            .filter((item) => item.privateStatus !== "REJECTED")
            .map((item) => {
              const pool = poolOverrides[item.receivableId] ?? item.pool;
              const showPoolCreation = item.privateStatus === "APPROVED" || (pool && (pool.status === "TERMS_READY" || pool.status === "CANDIDATE_READY" || pool.status === "PUBLICATION_PENDING" || pool.status === "PUBLISHED" || pool.status === "PROJECTION_PENDING"));
              const action = pool ? { href: `/pools/${pool.poolId}`, label: "Ver pool" } : nextAction(item);
              return <div key={item.receivableId} id={item.receivableId}>
                <strong>{item.title}</strong>
                <span>US$ {(Number(item.nominalUsdCents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · {pool && (pool.status === "PUBLISHED" || pool.status === "PROJECTION_PENDING") ? "Pool criada" : privateStatusLabels[item.privateStatus] ?? "Status em atualização"}</span>
                {showPoolCreation ? <LrpPoolCreation mode="LRP" receivableId={item.receivableId} pool={pool} onPublished={(published) => setPoolOverrides((current) => ({ ...current, [item.receivableId]: published }))} /> : pool ? <a className="button button--secondary" href={action.href}>{action.label}</a> : null}
              </div>;
            })}
          </div> : <><h2>Você pode criar seu primeiro recebível</h2><p>Cadastre um pagamento internacional para iniciar a análise.</p></> : receivables.length ? <div className="profile-items">{receivables.map((item) => <div key={item.id}><strong>{item.description}</strong><span>US$ {item.amountUsd.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · {item.status === "AWAITING_CLIENT" ? "aguardando pagador" : item.status === "UNDER_REVIEW" ? "em avaliação" : item.status === "POOLED" ? "pool criada" : item.status.toLowerCase()}</span></div>)}</div> : <><h2>Nenhum recebível ativo</h2><p>Você pode manter um recebível ativo por vez. Ao concluir, cancelar ou ter a solicitação rejeitada, poderá criar outro.</p></>}</div>
          {productMode === "LRP"
            ? lrpHistoryState === "ready"
              ? lrpJourney.active
                ? (lrpJourney.active.nextStep === "SHARE_CONFIRMATION" || lrpJourney.active.nextStep === "AWAIT_PAYER") && lrpJourney.active.confirmationUrl
                  ? <div className="demo-actions">
                    <button className="button button--secondary" type="button" onClick={() => { void navigator.clipboard.writeText(lrpJourney.active!.confirmationUrl!).then(() => setConfirmationCopied(true)); }}><Copy size={17} /> {confirmationCopied ? "Link copiado" : "Copiar link de confirmação"}</button>
                    <a className="button button--primary" href={lrpJourney.active.confirmationUrl} target="_blank" rel="noreferrer">Enviar confirmação ao pagador <ExternalLink size={17} /></a>
                  </div>
                  : null
                : <ButtonLink href="/recebivel" variant="secondary">Criar recebível</ButtonLink>
              : null
            : <ButtonLink href={receivables.some((item) => item.status === "UNDER_REVIEW") ? "/administracao" : "/recebivel"} variant="secondary">{receivables.some((item) => item.status === "UNDER_REVIEW") ? "Abrir avaliação" : "Criar recebível"}</ButtonLink>}
        </article>
        <article>
          <div><span className="kicker">Meus aportes</span>{productMode === "LRP" ? <><h2>Aportes ainda não estão disponíveis</h2><p>Nenhuma transferência será iniciada nesta versão.</p></> : contributions.length ? <div className="profile-items">{contributions.map((item) => <div key={item.id}><strong>{item.poolTitle}</strong><span>{item.amountSats.toLocaleString("pt-BR")} sats aportados · retorno central ≈ {item.expectedSats.toLocaleString("pt-BR")} sats</span></div>)}</div> : <><h2>Nenhuma participação ainda</h2><p>As pools financiadas por esta carteira aparecerão aqui com principal, cobertura, vencimento e distribuição.</p></>}</div>
          <ButtonLink href="/pools" variant="secondary">Encontrar uma pool</ButtonLink>
        </article>
      </section>

      {productMode === "LEGACY" ? <section className="dashboard-privacy dashboard-admin-demo"><FlaskConical aria-hidden="true" /><div><h2>Aprovação da plataforma no hackathon</h2><p>A área administrativa está aberta e sem senha somente para demonstrar a avaliação e a criação automática da pool.</p></div><ButtonLink href="/administracao" variant="secondary">Abrir administração</ButtonLink></section> : null}

      {productMode === "LEGACY"
        ? <section className="dashboard-privacy"><Radio aria-hidden="true" /><div><h2>Lightning Receivables Protocol</h2><p>A LRP v0.1 permite assinar um recebível com seu signer Nostr e acompanhar o grafo público reconstruível. Nenhum fundo real é movimentado.</p></div><ButtonLink href="/protocolo" variant="secondary">Abrir LRP v0.1</ButtonLink></section>
        : <section className="dashboard-privacy"><Radio aria-hidden="true" /><div><h2>Registros públicos verificáveis</h2><p>As informações públicas do seu recebível são assinadas e confirmadas pela rede, sem expor documentos ou dados do pagador.</p></div></section>}

      <section className="dashboard-section" aria-labelledby="missions-title">
        <div className="dashboard-section__heading">
          <div><span className="kicker">Limite e reputação</span><h2 id="missions-title">Missões para avançar</h2></div>
          <p>Somente sinais consentidos e verificáveis contam. Popularidade e gênero não alteram seu limite.</p>
        </div>
        <div className="mission-grid">
          {missions.map(({ icon: Icon, title, detail }) => (
            <article key={title}><Icon aria-hidden="true" /><div><h3>{title}</h3><p>{detail}</p></div><span>Começar</span></article>
          ))}
        </div>
      </section>

      <section className="dashboard-privacy">
        <ShieldCheck aria-hidden="true" />
        <div><h2>Reputação sem exposição</h2><p>O histórico cresce com operações reais. Atestados Nostr positivos são publicados automaticamente sem documentos, valores ou dados do pagador.</p></div>
      </section>
    </div>
  );
}
