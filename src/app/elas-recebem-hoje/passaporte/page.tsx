import type { Metadata } from "next";
import { ReceivablePassport } from "@/components/receivable-passport";

export const metadata: Metadata = {
  title: "Receivable Passport | Elas Recebem Hoje",
  description: "Histórico financeiro portátil e verificável construído sobre o Global Receivables Protocol.",
};

export default function Page() {
  return (
    <div className="inner-page">
      <div className="shell">
        <ReceivablePassport />
      </div>
    </div>
  );
}
