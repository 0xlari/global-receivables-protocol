"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Copy, ExternalLink, FlaskConical } from "lucide-react";

import type { ProtocolSignedEvent, ProtocolUnsignedEvent, ReceivableCreated } from "@protocol/schemas";
import { Nip07Signer, type Nip07Window } from "@nostr/signer";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import { createDemoReceivable, getDemoState, type DemoReceivable } from "@/lib/demo-store";
import type { LrpProductNextStep, LrpProductReceivable } from "@/services/lrp-product-read-service";

const DEMO_MIN_DATE = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const DEMO_MAX_DATE = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

type LrpDraft = { draftId: string; receivableId: string; status: string; privateStatus?: string; nextStep?: LrpProductNextStep; confirmationUrl?: string; candidate?: ProtocolUnsignedEvent; publicEventId?: string; pool?: LrpProductReceivable["pool"] };

async function saltedEvidence(file: File | null, requestKey: string) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const source = file ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode(`no-evidence:${requestKey}`);
  const bytes = new Uint8Array(salt.length + source.length); bytes.set(salt); bytes.set(source, salt.length);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const extension = file?.name.toLowerCase().match(/\.(pdf|png|jpe?g)$/)?.[0] ?? ".pdf";
  const declaredMimeType = extension === ".pdf" ? "application/pdf" : extension === ".png" ? "image/png" : "image/jpeg";
  return { sha256, extension, declaredMimeType, byteSize: file?.size || source.length };
}

export function ReceivableDemoForm({ lrpMode = "LEGACY" }: { lrpMode?: LrpOriginationMode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [profileId, setProfileId] = useState("");
  const [sessionPubkey, setSessionPubkey] = useState<string>();
  const [created, setCreated] = useState<DemoReceivable>();
  const [lrpDraft, setLrpDraft] = useState<LrpDraft>();
  const [lrpSigner, setLrpSigner] = useState<Nip07Signer>();
  const [lrpStatus, setLrpStatus] = useState("");
  const [lrpReadUnavailable, setLrpReadUnavailable] = useState(false);
  const [productMode, setProductMode] = useState<LrpOriginationMode>(lrpMode);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return setAuthenticated(false);
      const body = await response.json() as { profile?: { id: string; nostrPubkey?: string | null } };
      if (!body.profile?.id) return setAuthenticated(false);
      setProfileId(body.profile.id);
      setSessionPubkey(body.profile.nostrPubkey ?? undefined);
      try {
        const journeyResponse = await fetch("/api/receivables", { cache: "no-store" });
        if (!journeyResponse.ok) throw new Error("LRP_RECEIVABLE_READ_UNAVAILABLE");
        const journey = await journeyResponse.json() as { source: LrpOriginationMode; active?: LrpProductReceivable };
        setProductMode(journey.source);
        if (journey.source === "LRP") {
          if (journey.active) setLrpDraft({ ...journey.active, status: journey.active.originationStatus });
        } else {
          setCreated(getDemoState(body.profile.id).receivables[0]);
        }
      } catch {
        if (lrpMode === "LRP") {
          setLrpReadUnavailable(true);
        } else setCreated(getDemoState(body.profile.id).receivables[0]);
      }
      setAuthenticated(true);
    }).catch(() => setAuthenticated(false));
  }, [lrpMode]);

  async function linkSigner(signer: Nip07Signer) {
    const pubkey = await signer.getPublicKey();
    if (sessionPubkey === pubkey) return pubkey;
    if (sessionPubkey) throw new Error("A identidade usada não corresponde à sessão atual.");
    const challengeResponse = await fetch("/api/protocol/identity/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pubkey }) });
    const challenge = await challengeResponse.json() as { challengeId?: string; event?: ProtocolUnsignedEvent; error?: string };
    if (!challengeResponse.ok || !challenge.challengeId || !challenge.event) throw new Error(challenge.error ?? "Não foi possível vincular sua identidade de assinatura.");
    const proof = await signer.signEvent(challenge.event);
    const completeResponse = await fetch("/api/protocol/identity/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.challengeId, event: proof }) });
    const complete = await completeResponse.json() as { error?: string };
    if (!completeResponse.ok) throw new Error(complete.error ?? "Assinatura de vínculo inválida.");
    setSessionPubkey(pubkey);
    return pubkey;
  }

  async function prepareWithSigner(draftId: string) {
    try {
      setLrpStatus("Cadastro privado salvo. Solicitando sua assinatura Nostr…");
      const signer = Nip07Signer.fromWindow(window as unknown as Nip07Window);
      await linkSigner(signer);
      const response = await fetch("/api/receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare_candidate", draftId }) });
      const body = await response.json() as LrpDraft & { error?: string };
      if (!response.ok || !body.candidate) throw new Error(body.error ?? "Não foi possível preparar as informações públicas.");
      setLrpSigner(signer); setLrpDraft((current) => ({ ...current!, ...body }));
      setLrpStatus("Revise abaixo os dados públicos antes de assinar.");
    } catch (cause) {
      setLrpStatus("Seu acesso continua ativo, mas precisamos do seu assinador Nostr para autorizar esta publicação.");
      setError(cause instanceof Error && cause.message !== "NIP07_PROVIDER_NOT_AVAILABLE" ? cause.message : "Não encontramos um assinador Nostr neste navegador.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (productMode !== "LEGACY") {
        const requestKey = crypto.randomUUID();
        const evidenceFile = data.get("evidence") instanceof File ? data.get("evidence") as File : null;
        const evidence = await saltedEvidence(evidenceFile?.size ? evidenceFile : null, requestKey);
        const shadowLegacyReceivable = productMode === "SHADOW" ? createDemoReceivable(profileId, {
          purpose: String(data.get("purpose")) as DemoReceivable["purpose"], description: String(data.get("description")),
          amountUsd: Number(data.get("amountUsd")), dueDate: String(data.get("dueDate")), payerName: String(data.get("payerName")),
          payerCountry: String(data.get("payerCountry")), evidenceName: evidenceFile?.name || "comprovante-demo.pdf",
        }) : undefined;
        if (shadowLegacyReceivable) setCreated(shadowLegacyReceivable);
        const response = await fetch("/api/receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          action: "create_private", requestKey,
          paymentPurpose: String(data.get("purpose")), paymentDescription: String(data.get("description")),
          nominalUsdCents: String(Math.round(Number(data.get("amountUsd")) * 100)), dueDate: String(data.get("dueDate")),
          payerName: String(data.get("payerName")), payerCountry: String(data.get("payerCountry")),
          evidenceName: evidenceFile?.name || "não informado", evidence,
          publicPseudonym: String(data.get("publicPseudonym") || "Prestadora LRP"),
        }) });
        const body = await response.json() as LrpDraft & { error?: string };
        if (!response.ok || !body.draftId) throw new Error(body.error ?? "Não foi possível salvar o recebível privado.");
        setLrpDraft(body);
        if (productMode === "SHADOW") return;
        await prepareWithSigner(body.draftId);
        return;
      }
      const receivable = createDemoReceivable(profileId, {
        purpose: String(data.get("purpose")) as DemoReceivable["purpose"],
        description: String(data.get("description")),
        amountUsd: Number(data.get("amountUsd")),
        dueDate: String(data.get("dueDate")),
        payerName: String(data.get("payerName")),
        payerCountry: String(data.get("payerCountry")),
        evidenceName: (data.get("evidence") as File | null)?.name || "comprovante-demo.pdf",
      });
      setCreated(receivable);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o recebível.");
    }
  }

  async function signAndPublish() {
    if (!lrpDraft?.candidate) return;
    setError(""); setLrpStatus("Aguardando sua assinatura e a confirmação da rede…");
    try {
      const signer = lrpSigner ?? Nip07Signer.fromWindow(window as unknown as Nip07Window);
      await linkSigner(signer);
      const signed = await signer.signEvent(lrpDraft.candidate);
      const response = await fetch("/api/receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", draftId: lrpDraft.draftId, event: signed }) });
      const body = await response.json() as LrpDraft & { publicationStatus?: string; event?: ProtocolSignedEvent; error?: string };
      if (!response.ok && response.status !== 202) throw new Error(body.error ?? "Publicação falhou.");
      setLrpDraft((current) => ({ ...current!, ...body }));
      setLrpStatus(body.publicationStatus === "CONFIRMED" ? "Recebível confirmado pela rede." : "A publicação ainda não foi confirmada. Você poderá tentar novamente sem duplicar o recebível.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível publicar o recebível."); }
  }

  async function retryPublication() {
    if (!lrpDraft) return;
    setError(""); setLrpStatus("Repetindo a publicação sem duplicar o recebível…");
    try {
      const response = await fetch("/api/receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry", draftId: lrpDraft.draftId }) });
      const body = await response.json() as LrpDraft & { publicationStatus?: string; error?: string };
      if (!response.ok && response.status !== 202) throw new Error(body.error ?? "Retry falhou.");
      setLrpDraft((current) => ({ ...current!, ...body }));
      setLrpStatus(body.publicationStatus === "CONFIRMED" ? "Recebível confirmado pela rede." : "A publicação ainda não foi confirmada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível repetir a publicação."); }
  }

  const confirmationUrl = productMode !== "LRP" && created && typeof window !== "undefined"
    ? `${window.location.origin}/confirmar?demo=${created.token}`
    : "";

  if (authenticated === null) return <div className="dashboard-loading">Confirmando seu acesso…</div>;
  if (!authenticated) return <div className="demo-callout"><strong>Entre para continuar.</strong><a className="button button--primary" href="/entrar?next=/recebivel">Entrar com Nostr</a></div>;
  if (productMode === "LRP" && lrpReadUnavailable) return <section className="confirmation-form"><h2>Não foi possível carregar seu recebível agora.</h2><p>Tente novamente em alguns instantes. Nenhum dado local será usado como substituto.</p><button className="button button--secondary" type="button" onClick={() => window.location.reload()}>Tentar novamente</button></section>;

  if (productMode === "LRP" && lrpDraft?.pool && (lrpDraft.privateStatus === "POOLED" || lrpDraft.nextStep === "VIEW_POOL")) {
    return <section className="demo-success"><CheckCircle2 aria-hidden="true" /><span className="kicker">Pool publicada</span><h2>Seu recebível já possui uma pool.</h2><p>A pool está vinculada ao registro público confirmado pela rede.</p><div className="demo-actions"><a className="button button--primary" href={`/pools/${lrpDraft.pool.poolId}`}>Ver pool</a><a className="button button--secondary" href="/painel">Voltar ao painel</a></div></section>;
  }

  if (productMode === "LRP" && lrpDraft?.privateStatus === "UNDER_VALIDATION") {
    return <section className="demo-success"><span className="kicker">Análise da plataforma</span><h2>Seu recebível está em análise.</h2><p>Você poderá continuar assim que a avaliação for concluída.</p><a className="button button--secondary" href="/painel">Acompanhar no painel</a></section>;
  }

  if (productMode === "LRP" && lrpDraft?.privateStatus === "APPROVED" && !lrpDraft.pool) {
    return <section className="demo-success"><CheckCircle2 aria-hidden="true" /><span className="kicker">Recebível aprovado</span><h2>Revise os termos para criar sua pool.</h2><p>Os termos serão calculados pela plataforma antes da sua assinatura.</p><a className="button button--primary" href="/painel">Revisar e criar pool</a></section>;
  }

  if (productMode === "LRP" && (lrpDraft?.status === "PUBLISHED" || lrpDraft?.status === "PROJECTION_PENDING")) {
    return <section className="demo-success">
      <CheckCircle2 aria-hidden="true" />
      <span className="kicker">Recebível publicado</span>
      <h2>Seu registro público foi confirmado pela rede.</h2>
      <p>{lrpDraft.status === "PROJECTION_PENDING" ? "A atualização do histórico está em andamento." : "O recebível está pronto para a confirmação do pagador."}</p>
      {lrpDraft.confirmationUrl ? <label>Link privado para a próxima etapa<input value={lrpDraft.confirmationUrl} readOnly /></label> : <p>O link privado ainda não está disponível. Tente carregar esta página novamente.</p>}
      <div className="demo-actions"><a className="button button--secondary" href="/painel">Voltar ao painel</a></div>
    </section>;
  }

  if (productMode === "LRP" && lrpDraft?.candidate) {
    const publicContent = JSON.parse(lrpDraft.candidate.content) as ReceivableCreated;
    return <section className="confirmation-form">
      <span className="kicker">Revisão antes da assinatura</span>
      <h2>Somente estes dados serão públicos.</h2>
      <p>Nome do pagador, nome do arquivo e documento não serão publicados. A plataforma nunca solicita sua chave privada.</p>
      <dl className="authorization-review">
        <div><dt>Título público</dt><dd>{publicContent.title}</dd></div>
        <div><dt>Pseudônimo</dt><dd>{publicContent.provider_pseudonym}</dd></div>
        <div><dt>Valor e moeda</dt><dd>{publicContent.nominal_amount_minor} unidades menores de {publicContent.original_currency}</dd></div>
        <div><dt>Vencimento</dt><dd>{new Date(publicContent.due_at * 1000).toLocaleDateString("pt-BR")}</dd></div>
        <div><dt>Categoria e país</dt><dd>{publicContent.category} · {publicContent.country}</dd></div>
        <div><dt>Compromisso da evidência</dt><dd><code>{publicContent.private_evidence_hash}</code></dd></div>
        <div><dt>Identificador público da assinatura</dt><dd><code>{publicContent.provider_pubkey}</code></dd></div>
      </dl>
      <p role="status">{lrpStatus}</p>{error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="demo-actions">
        {lrpDraft.status === "PUBLICATION_PENDING"
          ? <button className="button button--primary" type="button" onClick={() => void retryPublication()}>Repetir publicação</button>
          : <button className="button button--primary" type="button" onClick={() => void signAndPublish()}>Assinar e publicar</button>}
      </div>
    </section>;
  }

  if (productMode === "LRP" && lrpDraft) {
    return <section className="demo-success">
      <span className="kicker">Cadastro salvo</span><h2>Revise as informações públicas</h2>
      <p>Confira os dados que serão assinados e publicados. Informações privadas e documentos permanecem protegidos na plataforma.</p>
      <p role="status">{lrpStatus}</p>{error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button--primary" type="button" onClick={() => void prepareWithSigner(lrpDraft.draftId)}>Revisar e autorizar publicação</button>
    </section>;
  }

  if (productMode !== "LRP" && created && !["AWAITING_CLIENT", "REJECTED"].includes(created.status)) {
    const pool = getDemoState(profileId).pools.find((item) => item.title === created.description);
    const underReview = created.status === "UNDER_REVIEW";
    return <section className="demo-success">
      <CheckCircle2 aria-hidden="true" />
      <span className="kicker">Recebível ativo</span>
      <h2>{underReview ? "Aguardando avaliação da plataforma." : "Sua pool BTC foi criada."}</h2>
      <p>{underReview ? "O pagador já confirmou os dados e o aceite de BTC. Abra a administração do hackathon para aprovar ou rejeitar." : "O recebível aprovado já aparece nas pools abertas e pode receber aportes demonstrativos."}</p>
      <div className="demo-actions"><a className="button button--primary" href={underReview ? "/administracao" : pool ? `/pools/${pool.id}` : "/pools"}>{underReview ? "Abrir avaliação" : "Ver pool"}</a><a className="button button--secondary" href="/painel">Voltar ao painel</a></div>
    </section>;
  }

  if (productMode !== "LRP" && created?.status === "AWAITING_CLIENT") {
    return <section className="demo-success">
      <CheckCircle2 aria-hidden="true" />
      <span className="kicker">Recebível cadastrado</span>
      <h2>Agora envie o link ao pagador.</h2>
      <p>Ele verá valor, data e origem, e confirmará que aceita pagar em BTC. Nesta demonstração, a assinatura da carteira é simulada e não movimenta sats.</p>
      <label>Link de confirmação<input value={confirmationUrl} readOnly /></label>
      <div className="demo-actions">
        <button className="button button--secondary" type="button" onClick={() => { void navigator.clipboard.writeText(confirmationUrl); setCopied(true); }}><Copy size={17} /> {copied ? "Copiado" : "Copiar link"}</button>
        <a className="button button--primary" href={confirmationUrl} target="_blank" rel="noreferrer">Abrir como pagador <ExternalLink size={17} /></a>
      </div>
      <a href="/painel">Voltar ao painel</a>
    </section>;
  }

  return <form className="receivable-demo-form" onSubmit={submit}>
    <div className="demo-mode-banner"><FlaskConical aria-hidden="true" /><span><strong>{productMode === "LRP" ? "Recebível com registro público" : "Modo demonstração do hackathon"}</strong> {productMode === "LRP" ? "Os dados privados serão salvos nos registros da plataforma. Somente os campos identificados como públicos serão enviados à rede depois da sua assinatura." : "Os dados ficam neste navegador. Limite demonstrativo: US$ 5.000. Nenhum fundo é movimentado."}</span></div>
    <div className="form-grid">
      <label>Origem do pagamento<select name="purpose" required defaultValue="SERVICE"><option value="SERVICE">Serviço</option><option value="SALARY">Salário</option><option value="SALE">Venda</option><option value="COMMISSION">Comissão</option><option value="OTHER">Outro</option></select></label>
      <label>Valor em USD<input name="amountUsd" type="number" min="10" max="5000" step="0.01" defaultValue="100" required /></label>
      <label className="form-grid__wide">Descrição do pagamento<input name="description" minLength={3} maxLength={90} defaultValue="Projeto internacional de design" required /></label>
      {productMode === "LRP" ? <label className="form-grid__wide">Pseudônimo público<input name="publicPseudonym" minLength={2} maxLength={60} defaultValue="Prestadora LRP" required /><small>Será publicado junto com descrição, valor, moeda, vencimento, categoria, país e compromisso da evidência.</small></label> : null}
      <label>Data combinada<input name="dueDate" type="date" min={DEMO_MIN_DATE} max={DEMO_MAX_DATE} required /></label>
      <label>País do pagador<select name="payerCountry" defaultValue="US" required><option value="US">Estados Unidos</option><option value="CA">Canadá</option><option value="GB">Reino Unido</option><option value="PT">Portugal</option><option value="OTHER">Outro</option></select></label>
      <label className="form-grid__wide">Nome ou empresa do pagador<input name="payerName" defaultValue="Cliente internacional" required /></label>
      <label className="form-grid__wide">Comprovante do recebível<input name="evidence" type="file" accept=".pdf,.png,.jpg,.jpeg" /></label>
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="button button--primary" type="submit">{productMode === "LRP" ? "Salvar e revisar informações públicas" : "Cadastrar e gerar link"}</button>
  </form>;
}
