"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CircleX, FlaskConical, RefreshCw } from "lucide-react";

import { DEMO_CHANGED_EVENT, getDemoPlatformState, resetDemoState, reviewDemoReceivable, type DemoReceivable } from "@/lib/demo-store";

const statusLabels: Record<DemoReceivable["status"], string> = {
  AWAITING_CLIENT: "Aguardando pagador",
  UNDER_REVIEW: "Pronto para avaliação",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  POOLED: "Pool criada",
};

export function DemoAdministration() {
  const [receivables, setReceivables] = useState<DemoReceivable[]>([]);
  const [message, setMessage] = useState("");
  const refresh = () => setReceivables(getDemoPlatformState().receivables);

  useEffect(() => {
    queueMicrotask(refresh);
    window.addEventListener(DEMO_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DEMO_CHANGED_EVENT, refresh);
  }, []);

  function review(id: string, decision: "APPROVE" | "REJECT") {
    try {
      const result = reviewDemoReceivable(id, decision);
      setMessage(result.pool ? `Recebível aprovado. Pool ${result.pool.id} criada.` : "Recebível rejeitado.");
      refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível avaliar.");
    }
  }

  return <div className="admin-demo">
    <div className="demo-mode-banner"><FlaskConical aria-hidden="true" /><span><strong>Administração aberta somente para o hackathon.</strong> Não há senha nesta demonstração. Em produção, esta área exige identidade separada, MFA e auditoria.</span></div>
    <div className="admin-demo__toolbar"><div><span className="kicker">Fila de avaliação</span><h2>Recebíveis cadastrados</h2></div><div className="demo-actions"><button className="button button--secondary" type="button" onClick={refresh}><RefreshCw size={17} /> Atualizar</button><button className="button button--secondary" type="button" onClick={() => { resetDemoState(); setMessage("Demonstração reiniciada."); refresh(); }}>Reiniciar demonstração</button></div></div>
    {message ? <p className="admin-demo__message" role="status">{message}</p> : null}
    {receivables.length === 0 ? <div className="empty-demo-state">Nenhum recebível foi cadastrado neste navegador.</div> : <div className="admin-demo__list">{receivables.map((item) => <article key={item.id}>
      <div className="admin-demo__status"><span className="tag tag--soft">{statusLabels[item.status]}</span><small>{item.id}</small></div>
      <h3>{item.description}</h3>
      <dl><div><dt>Valor</dt><dd>US$ {item.amountUsd.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</dd></div><div><dt>Vencimento</dt><dd>{new Date(`${item.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}</dd></div><div><dt>Pagador</dt><dd>{item.payerName} · {item.payerCountry}</dd></div><div><dt>Evidência</dt><dd>{item.evidenceName}</dd></div></dl>
      {item.status === "UNDER_REVIEW" ? <div className="demo-actions"><button className="button button--primary" type="button" onClick={() => review(item.id, "APPROVE")}><BadgeCheck size={17} /> Aprovar e criar pool</button><button className="button button--secondary" type="button" onClick={() => review(item.id, "REJECT")}><CircleX size={17} /> Rejeitar</button></div> : null}
      {item.status === "AWAITING_CLIENT" ? <p>A aprovação será liberada depois que o pagador confirmar o link e aceitar BTC.</p> : null}
    </article>)}</div>}
  </div>;
}
