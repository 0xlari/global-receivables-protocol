import type { Metadata } from "next";

import { DemoAdministration } from "@/components/demo-administration";
import { LrpOriginatorAdministration } from "@/components/lrp-originator-administration";
import { currentLrpModePolicy } from "@/config/lrp-mode";

export const metadata: Metadata = { title: "Administração da demonstração", robots: { index: false, follow: false } };

export default function AdministrationPage() {
  const policy = currentLrpModePolicy();
  return <div className="inner-page"><section className="page-hero page-hero--compact"><div className="shell page-hero__inner"><span className="eyebrow">Plataforma</span><h1>Avaliação do recebível.</h1><p>{policy.mode === "LEGACY" ? "Revise a confirmação e aprove a criação da pool BTC. Esta rota é aberta apenas para demonstrar o fluxo do hackathon." : "Confirme os fatos públicos com o signer institucional. A pool não é criada nesta etapa."}</p></div></section><section className="section"><div className="shell">{policy.mode === "LEGACY" ? <DemoAdministration /> : <LrpOriginatorAdministration mode={policy.mode} />}</div></section></div>;
}
