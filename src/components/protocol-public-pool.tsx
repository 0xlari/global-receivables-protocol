"use client";

import { useEffect, useState } from "react";

import type { PoolProjection } from "@protocol/reducers";
import type { ProtocolSignedEvent } from "@protocol/schemas";

type PublicEvent = ProtocolSignedEvent & { observedOn: string[] };
type PoolResponse = { pool: PoolProjection; progressBps: number; events: PublicEvent[]; rejected: { eventId: string; reason: string }[]; unavailableRelays: string[]; error?: string };

export function ProtocolPublicPool({ poolEventId }: { poolEventId: string }) {
  const [result, setResult] = useState<PoolResponse>(); const [error, setError] = useState("");
  useEffect(() => { void fetch(`/api/protocol/pools/${poolEventId}`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setResult(body); }).catch((reason) => setError(reason instanceof Error ? reason.message : "POOL_RELAY_QUERY_FAILED")); }, [poolEventId]);
  if (error) return <div className="demo-callout"><strong>Não foi possível reconstruir a pool.</strong><p>{error}</p></div>;
  if (!result) return <p role="status">Consultando e verificando eventos em três relays…</p>;
  const { pool, progressBps } = result; const terms = pool.terms; const pct = (progressBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return <div className="receivable-demo-form">
    <div className="demo-mode-banner"><strong>Reconstruída do Nostr.</strong> Esta página não consultou uma tabela central de pools e não movimenta dinheiro real.</div>
    <section className="confirmation-form"><span className="eyebrow">{pool.state}</span><h1>{terms.title}</h1><p>por {terms.provider_pseudonym}</p><div className="form-grid"><p><strong>Meta</strong><br />{BigInt(terms.target_sats).toLocaleString("pt-BR")} sats</p><p><strong>Progresso</strong><br />{pct}%</p><p><strong>Mínimo parcial</strong><br />50%</p><p><strong>Moeda original</strong><br />{terms.original_currency}</p><p><strong>Vencimento</strong><br />{new Date(terms.due_at * 1000).toLocaleDateString("pt-BR")}</p><p><strong>Retorno</strong><br />{(terms.expected_return_bps / 100).toFixed(2)}%</p><p><strong>Desconto</strong><br />{(terms.discount_bps / 100).toFixed(2)}%</p><p><strong>Multa por atraso</strong><br />2% + 0,10% ao dia, limite 10%</p><p className="form-grid__wide"><strong>Cliente originador</strong><br /><code>{terms.originator_pubkey}</code></p></div></section>
    <section className="confirmation-form"><h2>Reputação pública disponível</h2>{terms.public_reputation_facts.length ? <ul>{terms.public_reputation_facts.map((fact) => <li key={fact.event_id}>{fact.assertion}</li>)}</ul> : <p>Nenhum fato público foi anexado a esta versão.</p>}</section>
    <section className="confirmation-form"><h2>Eventos e assinaturas verificadas</h2>{result.events.map((event) => <details key={event.id}><summary>kind {event.kind} · {event.id.slice(0, 12)}…</summary><p>Autor: <code>{event.pubkey}</code></p><p>Assinatura: <code>{event.sig.slice(0, 24)}…</code></p><p>Encontrado em: {event.observedOn.join(", ") || "relay consultado"}</p></details>)}{result.rejected.length ? <p>{result.rejected.length} evento(s) inválido(s) foram ignorados pelo reducer.</p> : null}</section>
  </div>;
}
