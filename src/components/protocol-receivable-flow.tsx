"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import { buildReceivableCreated } from "@protocol/builders";
import type { ProtocolSignedEvent, ReceivableCreated } from "@protocol/schemas";
import { LRP_EVENT_VERSION } from "@protocol/version";
import { Nip07Signer, type Nip07Window } from "@nostr/signer";

type Session = { authenticated: boolean; profile?: { id: string; label: string; nostrPubkey?: string | null } };
type Published = { id: string; acknowledgedRelays: string[] };

async function saltedFileHash(file: File) {
  const salt = crypto.getRandomValues(new Uint8Array(32)); const bytes = new Uint8Array(await file.arrayBuffer()); const input = new Uint8Array(salt.length + bytes.length); input.set(salt); input.set(bytes, salt.length);
  const digest = await crypto.subtle.digest("SHA-256", input); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function usdMinor(value: string) {
  const [whole, decimal = ""] = value.replace(",", ".").split("."); return (BigInt(whole || "0") * 100n + BigInt(decimal.padEnd(2, "0").slice(0, 2))).toString();
}

export function ProtocolReceivableFlow({ initialReceivableEventId }: { initialReceivableEventId?: string } = {}) {
  const [session, setSession] = useState<Session>(); const [signer, setSigner] = useState<Nip07Signer>(); const [pubkey, setPubkey] = useState("");
  const [status, setStatus] = useState(""); const [published, setPublished] = useState<Published>(); const [evidenceFile, setEvidenceFile] = useState<File>();
  const [, setGraph] = useState<ProtocolSignedEvent[]>([]);
  useEffect(() => { fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()).then(setSession).catch(() => setSession({ authenticated: false })); }, []);
  useEffect(() => { if (!initialReceivableEventId || !/^[a-f0-9]{64}$/.test(initialReceivableEventId)) return; void (async () => {
    try { const [rootResponse, relatedResponse] = await Promise.all([fetch(`/api/protocol/events?event=${initialReceivableEventId}`), fetch(`/api/protocol/events?ref=${initialReceivableEventId}`)]); const root = await rootResponse.json(); const related = await relatedResponse.json(); const events = [...(root.events ?? []), ...(related.events ?? [])] as ProtocolSignedEvent[]; setGraph([...new Map(events.map((item) => [item.id, item])).values()]); setPublished({ id: initialReceivableEventId, acknowledgedRelays: root.observedOn?.[initialReceivableEventId] ?? [] }); setStatus("Eventos do recebível carregados dos relays."); } catch { setStatus("Não foi possível consultar a análise nos relays."); }
  })(); }, [initialReceivableEventId]);

  async function connect() {
    try {
      setStatus("Solicitando assinatura ao seu signer Nostr…"); const nextSigner = Nip07Signer.fromWindow(window as unknown as Nip07Window); const nextPubkey = await nextSigner.getPublicKey();
      if (session?.profile?.nostrPubkey !== nextPubkey) {
        const challengeResponse = await fetch("/api/protocol/identity/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pubkey: nextPubkey }) });
        const challenge = await challengeResponse.json(); if (!challengeResponse.ok) throw new Error(challenge.error);
        const event = await (window as unknown as Required<Nip07Window>).nostr.signEvent(challenge.event);
        const completeResponse = await fetch("/api/protocol/identity/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.challengeId, event }) });
        const complete = await completeResponse.json(); if (!completeResponse.ok) throw new Error(complete.error);
      }
      setSigner(nextSigner); setPubkey(nextPubkey); setStatus("Signer vinculado. A autoria será sua assinatura Nostr.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível conectar o signer."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!signer || !pubkey) return setStatus("Conecte seu signer Nostr primeiro.");
    try {
      setStatus("Preparando e assinando o recebível…"); const data = new FormData(event.currentTarget); const evidence = evidenceFile; if (!evidence || evidence.size === 0) throw new Error("Selecione uma evidência privada para gerar somente o hash.");
      const dueAt = Math.floor(new Date(`${String(data.get("dueDate"))}T12:00:00Z`).getTime() / 1000); const now = Math.floor(Date.now() / 1000);
      const content: ReceivableCreated = { protocol_version: LRP_EVENT_VERSION, event_type: "ReceivableCreated", receivable_id: crypto.randomUUID(), title: String(data.get("title")), provider_pseudonym: String(data.get("pseudonym")), provider_pubkey: pubkey, nominal_amount_minor: usdMinor(String(data.get("amount"))), original_currency: String(data.get("currency")).toUpperCase(), due_at: dueAt, category: String(data.get("category")) as ReceivableCreated["category"], country: "BR", private_evidence_hash: await saltedFileHash(evidence), receivable_version: 1, created_at: now };
      const signed = await signer.signEvent(buildReceivableCreated(content)); const response = await fetch("/api/protocol/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signed) }); const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Publicação sem quórum."); setPublished({ id: signed.id, acknowledgedRelays: body.acknowledgedRelays }); setStatus("Recebível assinado e confirmado por pelo menos dois relays.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível publicar o recebível."); }
  }

  if (!session) return <p role="status">Verificando sua sessão…</p>;
  if (!session.authenticated) return <div className="demo-callout"><strong>Entre com sua carteira Lightning antes de vincular o signer Nostr.</strong><Link className="button button--primary" href="/entrar?next=/protocolo">Entrar</Link></div>;
  return <div className="receivable-demo-form">
    <div className="demo-mode-banner"><strong>Protocolo experimental v0.1</strong> Nenhum aporte, DLC ou pagamento real será executado.</div>
    <section className="confirmation-form"><h2>1. Conectar signer Nostr</h2><p>Use uma extensão NIP-07. A plataforma nunca solicita sua nsec.</p><button className="button button--secondary" type="button" onClick={() => void connect()}>{pubkey ? "Signer conectado" : "Conectar signer"}</button>{pubkey ? <code>{pubkey.slice(0, 16)}…{pubkey.slice(-8)}</code> : null}</section>
    <form onSubmit={submit}><h2>2. Criar recebível público</h2><p>O documento fica no seu navegador; somente um hash com salt privado entra no evento.</p><div className="form-grid">
      <label className="form-grid__wide">Título público<input name="title" minLength={3} maxLength={120} required defaultValue="Pagamento internacional de design" /></label>
      <label>Pseudônimo público<input name="pseudonym" minLength={2} maxLength={60} required defaultValue="Criadora 21" /></label>
      <label>Categoria<select name="category" defaultValue="SERVICE"><option value="SERVICE">Serviço</option><option value="SALARY">Salário</option><option value="SALE">Venda</option><option value="COMMISSION">Comissão</option><option value="OTHER">Outro</option></select></label>
      <label>Valor nominal<input name="amount" inputMode="decimal" required defaultValue="2000.00" /></label><label>Moeda<input name="currency" pattern="[A-Za-z0-9]{3,12}" required defaultValue="USD" /></label>
      <label>Vencimento<input name="dueDate" type="date" required /></label><label>Evidência privada<input name="evidence" type="file" accept=".pdf,.png,.jpg,.jpeg" required onChange={(event) => setEvidenceFile(event.target.files?.[0])} /></label>
    </div><button className="button button--primary" disabled={!signer}>Assinar e publicar recebível</button></form>
    <p role="status">{status}</p>{published ? <section className="demo-success"><h2>Recebível publicado</h2><p>ACKs: {published.acknowledgedRelays.join(", ") || "consultando"}</p><Link className="button button--secondary" href={`/protocolo/originar?receivable=${published.id}`}>Abrir link do cliente originador</Link></section> : null}
    {published ? <p>A criação da pool usa agora os termos calculados no fluxo real do painel.</p> : null}
  </div>;
}
