"use client";

import { useMemo, useState } from "react";

import { Nip07Signer, type Nip07Window } from "@nostr/signer";
import type { PoolCreated, ProtocolSignedEvent, ProtocolUnsignedEvent } from "@protocol/schemas";

type PoolSummary = Readonly<{
  poolId: string;
  status: string;
  publicEventId?: string;
  canonicalSource: "LEGACY" | "LRP";
}>;

type PoolDraft = { poolOriginationId: string; poolId: string; status: string; termsHash: string; terms: Omit<PoolCreated, "terms_accepted_at">; candidate?: ProtocolUnsignedEvent; publicEventId?: string; publicationStatus?: string; error?: string };

function draftFromPool(receivableId: string, pool: PoolSummary): PoolDraft {
  return { poolOriginationId: receivableId, poolId: pool.poolId, status: pool.status, termsHash: "", terms: undefined as never, publicEventId: pool.publicEventId, publicationStatus: pool.status === "PUBLISHED" || pool.status === "PROJECTION_PENDING" ? "CONFIRMED" : undefined };
}

export function LrpPoolCreation({ mode, receivableId, pool, onPublished }: {
  mode: "SHADOW" | "LRP";
  receivableId: string;
  pool?: PoolSummary;
  onPublished?: (pool: PoolSummary) => void;
}) {
  const [loadedDraft, setLoadedDraft] = useState<PoolDraft | undefined>(pool ? draftFromPool(receivableId, pool) : undefined);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("A plataforma calculará e fixará os termos antes da sua assinatura.");
  const [busy, setBusy] = useState(false);

  const draft = useMemo<PoolDraft | undefined>(() => {
    if (pool && (pool.status === "PUBLISHED" || pool.status === "PROJECTION_PENDING")) return draftFromPool(receivableId, pool);
    if (pool && loadedDraft?.poolId === pool.poolId) return { ...loadedDraft, status: pool.status, publicEventId: pool.publicEventId, publicationStatus: pool.status === "PUBLISHED" || pool.status === "PROJECTION_PENDING" ? "CONFIRMED" : loadedDraft.publicationStatus };
    return loadedDraft;
  }, [pool, receivableId, loadedDraft]);

  async function request(body: Record<string, unknown>) {
    const response = await fetch("/api/lrp/pool-originations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as PoolDraft;
    if (!response.ok && response.status !== 202) throw new Error(result.error ?? "Não foi possível concluir a etapa da pool.");
    return result;
  }

  async function linkedSigner() {
    const signer = Nip07Signer.fromWindow(window as unknown as Nip07Window);
    const pubkey = await signer.getPublicKey();
    const session = await fetch("/api/auth/session", { cache: "no-store" });
    const sessionBody = await session.json() as { profile?: { nostrPubkey?: string | null } };
    const sessionPubkey = sessionBody.profile?.nostrPubkey;
    if (sessionPubkey && sessionPubkey !== pubkey) throw new Error("A identidade usada não corresponde à sessão atual.");
    if (!sessionPubkey) {
      const challengeResponse = await fetch("/api/protocol/identity/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pubkey }) });
      const challenge = await challengeResponse.json() as { challengeId?: string; event?: ProtocolUnsignedEvent; error?: string };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.event) throw new Error(challenge.error ?? "Assinatura indisponível.");
      const proof = await signer.signEvent(challenge.event);
      const complete = await fetch("/api/protocol/identity/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.challengeId, event: proof }) });
      if (!complete.ok) throw new Error("Não foi possível vincular a pubkey da prestadora.");
    }
    return signer;
  }

  async function load() {
    setBusy(true);
    try {
      const preview = await request({ action: "preview", receivableId });
      setLoadedDraft(preview);
      setMessage("Revise todos os termos calculados pela plataforma.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Consulta indisponível."); }
    finally { setBusy(false); }
  }

  async function consentAndPublish() {
    if (!draft || !accepted || !draft.terms) return;
    setBusy(true);
    try {
      const signer = mode === "LRP" ? await linkedSigner() : undefined;
      const prepared = await request({ action: "consent", poolOriginationId: draft.poolOriginationId, termsHash: draft.termsHash, consent: true });
      if (mode === "SHADOW") { setLoadedDraft(prepared); setMessage("Candidato validado sem publicação; a pool legada permanece canônica."); return; }
      if (!prepared.candidate || !signer) throw new Error("Não foi possível preparar os termos para assinatura.");
      const event: ProtocolSignedEvent = await signer.signEvent(prepared.candidate);
      const published = await request({ action: "publish", poolOriginationId: prepared.poolOriginationId, event });
      setLoadedDraft(published);
      if (published.publicationStatus === "CONFIRMED") {
        setMessage("Pool publicada com quórum 2/3.");
        onPublished?.({ poolId: published.poolId, status: published.status, publicEventId: published.publicEventId, canonicalSource: "LRP" });
      } else {
        setMessage("A publicação está em andamento. Tente novamente sem alterar as informações.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível publicar a pool."); }
    finally { setBusy(false); }
  }

  async function retry() {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await request({ action: "retry", poolOriginationId: draft.poolOriginationId });
      setLoadedDraft(result);
      if (result.publicationStatus === "CONFIRMED") {
        setMessage("Pool publicada com quórum 2/3.");
        onPublished?.({ poolId: result.poolId, status: result.status, publicEventId: result.publicEventId, canonicalSource: "LRP" });
      } else {
        setMessage("A publicação ainda aguarda confirmações suficientes.");
      }
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Retry indisponível."); }
    finally { setBusy(false); }
  }

  const terms = draft?.terms;
  const published = draft?.status === "PUBLISHED" || draft?.status === "PROJECTION_PENDING";
  return <div className="lrp-pool-creation">
    {published
      ? <>
        <strong>Pool publicada com quórum 2/3.</strong>
        <a className="button button--primary" href={`/pools/${draft!.poolId}`}>Ver pool</a>
      </>
      : !terms
        ? <button className="button button--secondary" type="button" disabled={busy} onClick={() => void load()}>Revisar termos e criar pool</button>
        : <>
          <dl className="authorization-review">
            <div><dt>Pool e recebível</dt><dd>{terms.pool_id} · {receivableId}</dd></div><div><dt>Título e pseudônimo</dt><dd>{terms.title} · {terms.provider_pseudonym}</dd></div>
            <div><dt>Meta</dt><dd>{terms.target_sats} sats</dd></div><div><dt>Mínimo parcial</dt><dd>50%</dd></div>
            <div><dt>Financiamento</dt><dd>{new Date(terms.funding_deadline * 1000).toLocaleString("pt-BR")}</dd></div><div><dt>Vencimento</dt><dd>{new Date(terms.due_at * 1000).toLocaleDateString("pt-BR")}</dd></div>
            <div><dt>Desconto e retorno estimado</dt><dd>{terms.discount_bps} bps · {terms.expected_return_bps} bps</dd></div><div><dt>Taxas do cliente</dt><dd>{terms.client_fees_sats} sats</dd></div>
            <div><dt>Atraso</dt><dd>2% fixo + 0,1% ao dia, limitado a 10%</dd></div><div><dt>Aceite parcial</dt><dd>24 horas acima de 50%</dd></div>
            <div><dt>Cancelamento</dt><dd>{terms.cancellation_policy}</dd></div><div><dt>Disputa</dt><dd>{terms.dispute_policy}</dd></div>
            <div><dt>Originador</dt><dd><code>{terms.originator_pubkey}</code> · concentração temporária de papéis</dd></div><div><dt>Versão</dt><dd>{terms.protocol_version}</dd></div>
          </dl>
          {draft.status === "PUBLICATION_PENDING" ? <button className="button button--primary" type="button" disabled={busy} onClick={() => void retry()}>Repetir publicação</button> : <><label><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> Li e aceito publicar exatamente estes campos e políticas.</label><button className="button button--primary" type="button" disabled={busy || !accepted} onClick={() => void consentAndPublish()}>{mode === "LRP" ? "Assinar e publicar pool" : "Validar comparação interna"}</button></>}
        </>}
    <p role="status">{message}</p>
  </div>;
}
