import type { Metadata } from "next";

import { GrpProtocolSetup } from "@/components/grp-protocol-setup";

export const metadata: Metadata = {
  title: "GRP Devnet",
  robots: { index: false, follow: false },
};

export default function GrpAdministrationPage() {
  return (
    <div className="inner-page">
      <section className="page-hero page-hero--compact">
        <div className="shell page-hero__inner">
          <span className="eyebrow">Infraestrutura</span>
          <h1>Inicialização do Global Receivables Protocol.</h1>
          <p>
            Verifique o programa na Devnet e inicialize o ProtocolConfig antes de
            criar o primeiro recebível on-chain.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="shell form-shell">
          <GrpProtocolSetup />
        </div>
      </section>
    </div>
  );
}
