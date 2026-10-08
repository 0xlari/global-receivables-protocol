import type { Metadata } from "next";
import { CircleDollarSign } from "lucide-react";

import { ErhOpportunities } from "@/components/erh-opportunities";

export const metadata: Metadata = {
  title: "Oportunidades | Elas Recebem Hoje",
  description: "Oportunidades de financiamento em USDC criadas pelo fluxo GRP.",
};

export default function ErhOpportunitiesPage() {
  return (
    <div className="inner-page">
      <section className="page-hero page-hero--compact">
        <div className="shell page-hero__inner">
          <span className="eyebrow"><CircleDollarSign size={16} /> Oportunidades</span>
          <h1>Recebíveis aprovados, prontos para buscar liquidez.</h1>
          <p>
            Cada oportunidade abaixo corresponde a uma pool USDC registrada na Solana
            Devnet pelo Global Receivables Protocol.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="shell">
          <ErhOpportunities />
        </div>
      </section>
    </div>
  );
}
