import type { Metadata } from "next";

import { GrpReceivableForm } from "@/components/grp-receivable-form";

export const metadata: Metadata = {
  title: "Criar recebível",
  description: "Cadastre um recebível global e registre seu compromisso financeiro na Solana.",
};

export default function ReceivablePage() {
  return (
    <div className="inner-page">
      <section className="page-hero page-hero--compact">
        <div className="shell page-hero__inner">
          <span className="eyebrow">Novo recebível</span>
          <h1>Cadastre o pagamento que você tem a receber.</h1>
          <p>
            Os dados privados permanecem fora da blockchain. O GRP registra na Solana o
            compromisso financeiro, o ciclo do recebível e seu histórico de liquidação.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="shell form-shell">
          <GrpReceivableForm />
        </div>
      </section>
    </div>
  );
}
