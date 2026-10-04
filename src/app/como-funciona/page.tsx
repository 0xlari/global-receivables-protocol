import type { Metadata } from "next";
import { ArrowRight, Bitcoin, CheckCircle2, CircleDollarSign, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/button-link";

export const metadata: Metadata = {
  title: "Como funciona",
  description: "Conheça o fluxo do recebível até a liquidação em Bitcoin.",
};

const stages = [
  {
    icon: CircleDollarSign,
    title: "1. Cadastre o recebível",
    body: "Informe a origem do pagamento, a descrição, o valor em USD, o pagador e o vencimento.",
  },
  {
    icon: CheckCircle2,
    title: "2. Peça a confirmação",
    body: "O pagador confere os dados e assina com a carteira. A assinatura confirma o compromisso, mas não movimenta sats.",
  },
  {
    icon: ShieldCheck,
    title: "3. Passe pela validação",
    body: "A plataforma analisa identidade, evidências, limite, duplicidade e histórico com regras explicáveis.",
  },
  {
    icon: Bitcoin,
    title: "4. Abra a pool BTC",
    body: "Aportadoras financiam contratos DLC. Os BTC ficam presos no contrato, nunca na carteira da plataforma.",
  },
  {
    icon: Bitcoin,
    title: "5. Receba em Bitcoin",
    body: "Quando a pool fecha ou o parcial é aceito, o oráculo atesta o evento e os contratos liberam o BTC diretamente.",
  },
  {
    icon: CircleDollarSign,
    title: "6. Quite e distribua",
    body: "No vencimento, o pagador paga uma invoice. A plataforma recebe apenas durante a redistribuição automática às aportadoras.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="inner-page">
      <section className="page-hero">
        <div className="shell page-hero__inner">
          <span className="eyebrow">Fluxo simples e verificável</span>
          <h1>Do trabalho entregue ao Bitcoin na carteira.</h1>
          <p>
            A plataforma não recebe dólares. O valor em USD registra o contrato; o
            pagador adquire BTC fora da plataforma e paga uma invoice Lightning.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="shell timeline">
          {stages.map(({ icon: Icon, title, body }) => (
            <article className="timeline__item" key={title}>
              <span className="timeline__icon">
                <Icon aria-hidden="true" />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="section section--tinted">
        <div className="shell split-callout">
          <div>
            <span className="kicker">Regra essencial</span>
            <h2>Sem aceite em BTC, sem pool.</h2>
          </div>
          <div>
            <p>
              O aceite fica registrado junto à confirmação do recebível. A cotação,
              validade da invoice e quantidade de sats são apresentadas antes do
              pagamento.
            </p>
            <ButtonLink href="/pools" variant="secondary">
              Ver pools BTC <ArrowRight aria-hidden="true" size={18} />
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
