"use client";

import { useState } from "react";
import { BadgeCheck, RefreshCw } from "lucide-react";

import { Nip07Signer, type Nip07Window } from "@nostr/signer";
import type { ProtocolSignedEvent, ProtocolUnsignedEvent } from "@protocol/schemas";

type Item = { receivableId: string; status: string; dueAt: string };
type Prepared = { originatorEventId: string; status: string; candidate?: ProtocolUnsignedEvent; error?: string };

export function LrpOriginatorAdministration({ mode }: { mode: "SHADOW" | "LRP" }) {
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState("Conecte o signer institucional para carregar a fila privada.");
  const [busy, setBusy] = useState(false);
  const [signer, setSigner] = useState<Nip07Signer>();

  async function loadQueue() {
    const response = await fetch("/api/lrp/originator-events", { cache: "no-store" });
    const body = await response.json() as { receivables?: Item[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar a fila.");
    setItems(body.receivables ?? []);
  }

  async function linkSigner() {
    const nextSigner = Nip07Signer.fromWindow(window as unknown as Nip07Window);
    const pubkey = await nextSigner.getPublicKey();
    const session = await fetch("/api/auth/session", { cache: "no-store" });
    const sessionBody = await session.json() as { profile?: { nostrPubkey?: string | null } };
    if (sessionBody.profile?.nostrPubkey !== pubkey) {
      const challengeResponse = await fetch("/api/protocol/identity/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pubkey }) });
      const challenge = await challengeResponse.json() as { challengeId?: string; event?: ProtocolUnsignedEvent; error?: string };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.event) throw new Error(challenge.error ?? "Não foi possível vincular o signer.");
      const proof = await nextSigner.signEvent(challenge.event);
      const completeResponse = await fetch("/api/protocol/identity/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.challengeId, event: proof }) });
      if (!completeResponse.ok) throw new Error("Assinatura de vínculo inválida.");
    }
    setSigner(nextSigner);
    await loadQueue();
    setMessage(`Signer institucional conectado. Modo ${mode}.`);
    return nextSigner;
  }

  async function call(action: string, payload: Record<string, unknown>) {
    const response = await fetch("/api/lrp/originator-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const body = await response.json() as Prepared;
    if (!response.ok) throw new Error(body.error ?? "Etapa LRP não concluída.");
    return body;
  }

  async function signAndPublish(activeSigner: Nip07Signer, prepared: Prepared, action: string) {
    if (mode === "SHADOW" || !prepared.candidate) return;
    const event: ProtocolSignedEvent = await activeSigner.signEvent(prepared.candidate);
    await call(action, { originatorEventId: prepared.originatorEventId, event });
  }

  async function processReceivable(receivableId: string) {
    setBusy(true);
    try {
      const activeSigner = signer ?? await linkSigner();
      setMessage("Assinando a prova de confirmação do pagador…");
      await signAndPublish(activeSigner, await call("prepare_payer_commitment", { receivableId }), "publish_payer_commitment");
      setMessage("Executando os critérios existentes e assinando a decisão…");
      await signAndPublish(activeSigner, await call("evaluate_validation", { receivableId, correlationId: crypto.randomUUID() }), "publish_validation");
      setMessage("Validando pay_invoice e assinando o atestado NWC…");
      await signAndPublish(activeSigner, await call("prepare_nwc_attestation", { receivableId }), "publish_nwc_attestation");
      setMessage(mode === "SHADOW" ? "Candidatos validados sem publicação. O legado permanece efetivo." : "Três eventos publicados com quórum. Nenhuma pool foi criada.");
      await loadQueue();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível concluir a análise LRP.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-demo">
    <div className="demo-mode-banner"><BadgeCheck aria-hidden="true" /><span><strong>Originação {mode}.</strong> Esta fila não cria pools. Dados privados permanecem no PostgreSQL.</span></div>
    <div className="admin-demo__toolbar"><div><span className="kicker">Fila privada do originador</span><h2>Recebíveis para análise</h2></div><button className="button button--secondary" type="button" disabled={busy} onClick={() => void linkSigner()}><RefreshCw size={17} /> Conectar signer e atualizar</button></div>
    <p className="admin-demo__message" role="status">{message}</p>
    {items.length === 0 ? <div className="empty-demo-state">Nenhum recebível disponível para este modo.</div> : <div className="admin-demo__list">{items.map((item) => <article key={item.receivableId}>
      <div className="admin-demo__status"><span className="tag tag--soft">{item.status}</span><small>{item.receivableId}</small></div>
      <p>Vencimento: {new Date(item.dueAt).toLocaleDateString("pt-BR")}</p>
      <button className="button button--primary" type="button" disabled={busy} onClick={() => void processReceivable(item.receivableId)}>Processar confirmação, decisão e NWC</button>
    </article>)}</div>}
  </div>;
}
