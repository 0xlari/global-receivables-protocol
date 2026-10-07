import type { Metadata } from "next";

import { GrpProtocolSetup } from "@/components/grp-protocol-setup";
import { GrpReceivableAdministration } from "@/components/grp-receivable-administration";

export const metadata: Metadata = {
  title: "Admin GRP",
  robots: { index: false, follow: false },
};

export default function GrpAdministrationPage() {
  return (
    <div className="inner-page">
      <section className="page-hero page-hero--compact">
        <div className="shell page-hero__inner">
          <span className="eyebrow">GRP · Administração</span>
          <h1>Protocolo e validação de recebíveis.</h1>
          <p>
            Verifique o estado do protocolo na Devnet e revise recebíveis confirmados
            pelos pagadores antes de liberar o financiamento.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="shell form-shell">
          <GrpProtocolSetup />
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <GrpReceivableAdministration />
        </div>
      </section>
    </div>
  );
}
