import type { Metadata } from "next";

import { ClientConfirmationForm } from "@/components/client-confirmation-form";

export const metadata: Metadata = {
  title: "Confirmar recebível | Elas Recebem Hoje",
  description: "Confirmação segura do pagador.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ErhConfirmationPage() {
  return (
    <div className="inner-page confirmation-page">
      <section className="page-hero page-hero--compact">
        <div className="shell page-hero__inner">
          <span className="eyebrow">Elas Recebem Hoje · confirmação do pagador</span>
          <h1>Confirme o recebível e autorize o pagamento.</h1>
          <p>
            Confira valor, data e origem do pagamento. Se estiver correto, conecte a
            carteira Solana que fará a liquidação em USDC.
          </p>
        </div>
      </section>
      <section className="section confirmation-section">
        <div className="shell confirmation-shell">
          <ClientConfirmationForm />
        </div>
      </section>
    </div>
  );
}
