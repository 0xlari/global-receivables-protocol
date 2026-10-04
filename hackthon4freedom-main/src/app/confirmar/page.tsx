import type { Metadata } from "next";

import { ClientConfirmationForm } from "@/components/client-confirmation-form";

export const metadata: Metadata = {
  title: "Confirmar recebível",
  description: "Confirmação segura do pagador.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmationPage() {
  return (
    <div className="inner-page confirmation-page">
      <section className="page-hero page-hero--compact">
        <div className="shell page-hero__inner">
          <span className="eyebrow">Confirmação do pagador</span>
          <h1>Confira antes da plataforma avaliar.</h1>
          <p>Você confirma ou contesta valor, data e pagamento em BTC. Quem aporta não participa desta validação.</p>
        </div>
      </section>
      <section className="section confirmation-section"><div className="shell confirmation-shell"><ClientConfirmationForm /></div></section>
    </div>
  );
}
