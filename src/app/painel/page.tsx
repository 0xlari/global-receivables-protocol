import type { Metadata } from "next";

import { GrpDashboard } from "@/components/grp-dashboard";

export const metadata: Metadata = {
  title: "Painel GRP",
  description: "Acompanhe seus recebíveis no Global Receivables Protocol.",
};

export default function DashboardPage() {
  return (
    <div className="inner-page">
      <div className="shell">
        <GrpDashboard />
      </div>
    </div>
  );
}
