"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import { buildClientValidationDecision, buildNwcAuthorizationAttestation, buildPayerCommitmentProof } from "@protocol/builders";
import type { ProtocolSignedEvent, ReceivableCreated } from "@protocol/schemas";
import { LRP_EVENT_VERSION } from "@protocol/version";
import { Nip07Signer, type Nip07Window } from "@nostr/signer";

type RelayResult = { events: ProtocolSignedEvent[] };
type NwcPreparation = { maxAmountMsat: string; dueAt: string; expiresAt: string; safeFingerprint: string; lastValidatedAt: string };
const LRP_ORIGINATOR_TERMS_VERSION = "lrp-originator/0.1";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function publish(signer: Nip07Signer, unsigned: Parameters<Nip07Signer["signEvent"]>[0]) {
  const signed = await signer.signEvent(unsigned);
  const response = await fetch("/api/protocol/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signed) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Publicação sem quórum.");
  return signed;
}

export function ProtocolOriginatorFlow({ receivableEventId }: { receivableEventId: string }) {
  const [receivable, setReceivable] = useState<{ event: ProtocolSignedEvent; content: ReceivableCreated }>();
  const [signer, setSigner] = useState<Nip07Signer>(); const [pubkey, setPubkey] = useState("");
  const [status, setStatus] = useState("Consultando o recebível nos relays…"); const [done, setDone] = useState(false);
  useEffect(() => { void (async () => {
    try {
      const response = await fetch(`/api/protocol/events?event=${encodeURIComponent(receivableEventId)}`, { cache: "no-store" }); const body = await response.json() as RelayResult;
      const event = body.events?.find((item) => item.id === receivableEventId); if (!event) throw new Error("Recebível não encontrado nos relays.");
      const content = JSON.parse(event.content) as ReceivableCreated; if (content.event_type !== "ReceivableCreated") throw new Error("Evento não é um recebível.");
      setReceivable({ event, content }); setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Falha ao consultar recebível."); }
  })(); }, [receivableEventId]);

  async function connect() {
    try {
      const next = Nip07Signer.fromWindow(window as unknown as Nip07Window); const key = await next.getPublicKey();
      const challengeResponse = await fetch("/api/protocol/identity/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pubkey: key }) });
      if (!challengeResponse.ok) throw new Error("Entre com sua carteira Lightning antes de vincular o signer.");
      const challenge = await challengeResponse.json(); const event = await (window as unknown as Required<Nip07Window>).nostr.signEvent(challenge.event);
      const completeResponse = await fetch("/api/protocol/identity/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.challengeId, event }) });
      if (!completeResponse.ok) throw new Error("Não foi possível vincular a identidade Nostr.");
      setSigner(next); setPubkey(key); setStatus("Identidade do cliente originador vinculada.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Signer indisponível."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!signer || !pubkey || !receivable) return setStatus("Conecte o signer e aguarde o recebível.");
    try {
      const data = new FormData(event.currentTarget); const decision = String(data.get("decision")) as "APPROVED" | "REJECTED" | "NEEDS_INFORMATION";
      const now = Math.floor(Date.now() / 1000); const nonce = crypto.randomUUID();
      let nwc: NwcPreparation | undefined;
      if (decision === "APPROVED") {
        setStatus("Validando pay_invoice e guardando a URI NWC criptografada…");
        const dueAt = new Date(receivable.content.due_at * 1000); const expiresAt = new Date(dueAt.getTime() + 3 * 86_400_000);
        const nwcResponse = await fetch("/api/protocol/nwc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", receivableEventId: receivable.event.id, nwcUri: String(data.get("nwcUri")), maxAmountMsat: String(data.get("maxAmountMsat")), dueAt: dueAt.toISOString(), expiresAt: expiresAt.toISOString() }) });
        const rawNwc = await nwcResponse.json(); if (!nwcResponse.ok) throw new Error((rawNwc as { error?: string }).error ?? "Conexão NWC inválida."); nwc = rawNwc as NwcPreparation;
      }
      const privateConfirmationHash = await sha256(JSON.stringify({ receivable: receivable.event.id, terms: LRP_ORIGINATOR_TERMS_VERSION, acceptsBitcoin: true, nonce }));
      setStatus("Assinando a confirmação privada do cliente…");
      const commitment = await publish(signer, buildPayerCommitmentProof({ protocol_version: LRP_EVENT_VERSION, event_type: "PayerCommitmentProof", proof_id: crypto.randomUUID(), receivable_event_id: receivable.event.id, private_confirmation_hash: privateConfirmationHash, confirmed_at: now, terms_version: LRP_ORIGINATOR_TERMS_VERSION, accepts_bitcoin: true, has_nwc_authorization: decision === "APPROVED", originator_pubkey: pubkey }));
      setStatus("Assinando a decisão independente…");
      const validation = await publish(signer, buildClientValidationDecision({ protocol_version: LRP_EVENT_VERSION, event_type: "ClientValidationDecision", decision_id: crypto.randomUUID(), receivable_event_id: receivable.event.id, decision, policy_version: "lrp-validation/0.1", reason_codes: [String(data.get("reasonCode") || "TERMS_VERIFIED").toUpperCase().replace(/[^A-Z0-9_]/g, "_")], decided_at: now, client_pubkey: pubkey }));
      if (decision !== "APPROVED") { setDone(true); setStatus(`Decisão ${decision} publicada. Nenhuma pool pode ser criada com esta decisão.`); return; }
      if (!nwc) throw new Error("NWC_PREPARATION_MISSING");
      setStatus("Assinando apenas o atestado público, sem URI ou segredo…");
      const attestation = await publish(signer, buildNwcAuthorizationAttestation({ protocol_version: LRP_EVENT_VERSION, event_type: "NwcAuthorizationAttestation", attestation_id: crypto.randomUUID(), receivable_event_id: receivable.event.id, authorization_state: "ACTIVE", pay_invoice_supported: true, max_authorized_msat: nwc.maxAmountMsat, due_at: Math.floor(new Date(nwc.dueAt).getTime() / 1000), expires_at: Math.floor(new Date(nwc.expiresAt).getTime() / 1000), single_use: true, safe_fingerprint: nwc.safeFingerprint, last_validated_at: Math.floor(new Date(nwc.lastValidatedAt).getTime() / 1000), executor_pubkey: pubkey }));
      await fetch("/api/protocol/nwc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "record_attestation", receivableEventId: receivable.event.id, attestationEventId: attestation.id }) });
      sessionStorage.setItem(`erh:originator:${receivable.event.id}`, JSON.stringify({ commitment: commitment.id, validation: validation.id, attestation: attestation.id }));
      setDone(true); setStatus("Aprovação e atestado NWC confirmados por pelo menos dois relays.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível concluir a análise."); }
  }

  return <div className="receivable-demo-form">
    <div className="demo-mode-banner"><strong>Experimental, sem pagamentos reais.</strong> O cliente confirma, decide e autoriza. Quem aporta não valida o recebível.</div>
    {receivable ? <section className="confirmation-form"><h2>{receivable.content.title}</h2><p>{receivable.content.provider_pseudonym} · {receivable.content.original_currency} {Number(BigInt(receivable.content.nominal_amount_minor)) / 100}</p></section> : null}
    <section className="confirmation-form"><h2>1. Assinar como cliente originador</h2><p>Esta assinatura confirma autoria. A plataforma nunca pede sua chave privada.</p><button className="button button--secondary" type="button" onClick={() => void connect()}>{pubkey ? "Signer conectado" : "Conectar signer Nostr"}</button></section>
    <form onSubmit={submit}><h2>2. Analisar e autorizar</h2><div className="form-grid">
      <label>Decisão<select name="decision" defaultValue="APPROVED"><option value="APPROVED">Aprovar</option><option value="NEEDS_INFORMATION">Pedir informações</option><option value="REJECTED">Rejeitar</option></select></label>
      <label>Código do motivo<input name="reasonCode" defaultValue="TERMS_VERIFIED" pattern="[A-Za-z0-9_]{2,64}" required /></label>
      <label className="form-grid__wide">Conexão NWC obrigatória somente para aprovação<textarea name="nwcUri" placeholder="nostr+walletconnect://…" /></label>
      <label>Limite autorizado (msat)<input name="maxAmountMsat" inputMode="numeric" pattern="[0-9]+" defaultValue="100000000" required /></label>
    </div><p>Você pode gerar uma conexão na Coinos ou usar qualquer serviço NWC compatível com <code>pay_invoice</code>. A conexão autoriza execução limitada; não é uma carteira Nostr e não garante o pagamento.</p><button className="button button--primary" disabled={!signer || !receivable}>Confirmar, assinar e publicar</button></form>
    <p role="status">{status}</p>{done ? <Link className="button button--primary" href={`/protocolo?receivable=${receivableEventId}`}>Voltar para a prestadora revisar a pool</Link> : null}
  </div>;
}
