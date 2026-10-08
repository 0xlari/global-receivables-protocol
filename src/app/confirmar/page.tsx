import type { Metadata } from "next";

import { ClientConfirmationForm } from "@/components/client-confirmation-form";

export const metadata: Metadata = {
  title: "Confirm receivable | GRP",
  description: "Secure payer confirmation for a GRP receivable.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmationPage() {
  return (
    <div className="inner-page confirmation-page">
      <section className="page-hero page-hero--compact">
        <div className="shell page-hero__inner">
          <span className="eyebrow">GRP Direct · payer confirmation</span>
          <h1>Confirm the receivable and authorize settlement.</h1>
          <p>
            Review the amount, due date and payment details. If everything is correct,
            connect the Solana wallet that will settle the receivable in USDC.
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
