import type { Metadata } from "next";
import { Bitcoin } from "lucide-react";

import { PoolsExplorer } from "@/components/pools-explorer";
import { lrpOriginationModeFromEnvironment } from "@/config/lrp-mode";

export const metadata: Metadata = { title: "Pools BTC", description: "Pools BTC avaliadas pela plataforma, com prazo, cobertura e risco transparentes." };

export default function PoolsPage() {
  const mode = lrpOriginationModeFromEnvironment();
  const lrpRead = mode === "LRP";
  return (
    <div className="inner-page">
      <section className="page-hero page-hero--compact"><div className="shell page-hero__inner">
        <span className="eyebrow"><Bitcoin aria-hidden="true" size={16} /> Pools abertas</span>
        <h1>{lrpRead ? "Acompanhe pools públicas verificadas pelo LRP." : "Escolha uma pool. Entenda o risco. Aporte em BTC."}</h1>
        <p>{lrpRead ? "Consulte condições públicas confirmadas pela rede. Aportes ainda não estão disponíveis." : "Todos os recebíveis foram confirmados pelo pagador e avaliados pela plataforma. A aportadora decide apenas se quer participar."}</p>
      </div></section>
      <section className="section"><div className="shell">
        <div className="pool-list-intro"><div><span className="kicker">Full BTC</span><h2>{lrpRead ? "Pools públicas confirmadas" : "Pools buscando financiamento"}</h2></div><p>{lrpRead ? "A plataforma mostra somente informações verificadas e sinaliza quando uma atualização ainda está em andamento." : "O principal, a cobertura disponível e a parte não coberta aparecem antes do aporte. Rendimentos não são garantidos."}</p></div>
        <PoolsExplorer mode={mode} />
      </div></section>
    </div>
  );
}
