import type { Metadata } from "next";

import { AuthenticatedDashboard } from "@/components/authenticated-dashboard";
import { lrpOriginationModeFromEnvironment } from "@/config/lrp-mode";

export const metadata: Metadata = { title: "Painel", description: "Crie um recebível, acompanhe seu limite ou encontre pools BTC." };

export default function DashboardPage() {
  return <div className="inner-page"><div className="shell"><AuthenticatedDashboard lrpMode={lrpOriginationModeFromEnvironment()} /></div></div>;
}
