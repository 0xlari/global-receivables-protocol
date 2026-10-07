import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleDollarSign, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Oportunidades | Elas Recebem Hoje",
  description: "Acompanhe oportunidades de financiamento em USDC no Elas Recebem Hoje.",
};

export default function ErhOpportunitiesPage() {
  return (
    <div className="inner-page">
      <section className="page-hero page-hero--compact">
        <div className="shell page-hero__inner">
          <span className="eyebrow"><CircleDollarSign size={16} /> Oportunidades</span>
          <h1>Financiamento em USDC, sem legado BTC.</h1>
          <p>Esta área mostra apenas oportunidades criadas pelo fluxo GRP. As pools antigas de BTC/LRP não fazem parte do Elas Recebem Hoje.</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="empty-demo-state">
            <ShieldCheck size={28} />
            <h2>Nenhuma oportunidade GRP está aberta agora.</h2>
            <p>Uma oportunidade aparecerá aqui depois que um recebível for confirmado, aprovado e tiver uma pool USDC criada.</p>
            <Link className="button button--primary" href="/elas-recebem-hoje/painel">
              Ver meus recebíveis <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
