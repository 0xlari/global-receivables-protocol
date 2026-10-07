import type { Metadata } from "next";

import { GrpReceivableForm } from "@/components/grp-receivable-form";

export const metadata: Metadata = {
  title: "Criar recebível | Elas Recebem Hoje",
  description: "Cadastre um recebível internacional no Elas Recebem Hoje.",
};

export default function ErhReceivablePage() {
  return (
    <div className="inner-page">
      <section className="page-hero page-hero--compact">
        <div className="shell page-hero__inner">
          <span className="eyebrow">Elas Recebem Hoje · novo recebível</span>
          <h1>Cadastre o pagamento que você tem a receber.</h1>
          <p>
            Você acompanha tudo pelo Elas Recebem Hoje. A infraestrutura do GRP registra
            somente o estado financeiro necessário na Solana.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="shell form-shell">
          <GrpReceivableForm
            experience="ERH"
            loginHref="/elas-recebem-hoje/entrar?next=/elas-recebem-hoje/recebivel"
            dashboardHref="/elas-recebem-hoje/painel"
          />
        </div>
      </section>
    </div>
  );
}
