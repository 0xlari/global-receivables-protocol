import type { Metadata } from "next";
import { ReceivableDemoForm } from "@/components/receivable-demo-form";
import { lrpOriginationModeFromEnvironment } from "@/config/lrp-mode";

export const metadata: Metadata = { title: "Criar recebível", description: "Cadastre um pagamento internacional para avaliação da plataforma." };

export default function ReceivablePage() {
  return <div className="inner-page">
    <section className="page-hero page-hero--compact"><div className="shell page-hero__inner"><span className="eyebrow">Novo recebível</span><h1>Cadastre o pagamento que você tem a receber.</h1><p>Salário, venda, comissão, serviço ou outro pagamento legítimo do exterior. Você pode manter somente um recebível ativo por vez.</p></div></section>
    <section className="section"><div className="shell form-shell"><ReceivableDemoForm lrpMode={lrpOriginationModeFromEnvironment()} /></div></section>
  </div>;
}
