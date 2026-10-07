import type { Metadata } from "next";

import { GrpDashboard } from "@/components/grp-dashboard";

export const metadata: Metadata = {
  title: "Meu painel | Elas Recebem Hoje",
  description: "Acompanhe seus recebíveis no Elas Recebem Hoje.",
};

export default function ErhDashboardPage() {
  return (
    <div className="inner-page">
      <div className="shell">
        <GrpDashboard
          experience="ERH"
          createHref="/elas-recebem-hoje/recebivel"
          loginHref="/elas-recebem-hoje/entrar?next=/elas-recebem-hoje/painel"
        />
      </div>
    </div>
  );
}
