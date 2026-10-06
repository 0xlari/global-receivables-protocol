import {
  ArrowRight,
  BadgeCheck,
  FileCheck2,
  Globe2,
  Radio,
  Sparkles,
} from "lucide-react";
import { ButtonLink } from "@/components/button-link";

const steps = [
  {
    number: "01",
    title: "Você apresenta o recebível",
    body: "Cadastre o serviço, salário, venda ou comissão com valor e data combinados com o pagador no exterior.",
  },
  {
    number: "02",
    title: "O pagador confirma",
    body: "Por um link privado, ele confere os dados e confirma o compromisso com a própria carteira.",
  },
  {
    number: "03",
    title: "A plataforma valida",
    body: "Evidências, duplicidade e elegibilidade passam por regras claras antes da pool existir.",
  },
  {
    number: "04",
    title: "Você recebe antes",
    body: "A pool financia o recebível em USDC e você acessa liquidez antes do vencimento.",
  },
];

export const metadata = {
  title: "Elas Recebem Hoje",
  description: "Vertical brasileira de antecipação de recebíveis internacionais powered by GRP.",
};

export default function ElasRecebemHojePage() {
  return (
    <>
      <section className="hero">
        <div className="shell hero__grid">
          <div className="hero__copy">
            <div className="eyebrow">
              <Sparkles aria-hidden="true" size={16} />
              Powered by Global Receivables Protocol
            </div>
            <h1>
              Seu pagamento já tem data. <em>Seu dinheiro não precisa esperar.</em>
            </h1>
            <p className="hero__lead">
              Antecipe recebíveis de clientes no exterior com uma experiência pensada
              para profissionais no Brasil, usando a infraestrutura do GRP por baixo.
            </p>
            <div className="hero__actions">
              <ButtonLink href="/entrar?next=/recebivel">
                Criar recebível <ArrowRight aria-hidden="true" size={18} />
              </ButtonLink>
              <ButtonLink href="/" variant="secondary">
                Conhecer o protocolo
              </ButtonLink>
            </div>
            <ul className="trust-list" aria-label="Princípios da plataforma">
              <li><BadgeCheck aria-hidden="true" size={17} /> Recebível verificável</li>
              <li><FileCheck2 aria-hidden="true" size={17} /> Evidências privadas</li>
              <li><Radio aria-hidden="true" size={17} /> Histórico portátil</li>
            </ul>
          </div>

          <div className="hero-board" aria-label="Exemplo de recebível">
            <div className="hero-board__halo" aria-hidden="true" />
            <div className="receipt-card">
              <div className="receipt-card__head">
                <span className="tag tag--success">
                  <FileCheck2 aria-hidden="true" size={15} /> Recebível aprovado
                </span>
                <span className="receipt-card__id">#ERH-024</span>
              </div>
              <p>Pagamento internacional confirmado</p>
              <strong>US$ 2.000</strong>
              <div className="receipt-card__rows">
                <span>
                  <small>Antecipação</small>
                  1.900 USDC
                </span>
                <span>
                  <small>Vencimento</small>
                  Dia 30
                </span>
              </div>
            </div>
            <div className="floating-note floating-note--client">
              <Globe2 aria-hidden="true" size={18} />
              <span>
                Pagador no exterior
                <strong>Compromisso confirmado</strong>
              </span>
            </div>
            <div className="floating-note floating-note--wallet">
              <BadgeCheck aria-hidden="true" size={18} />
              <span>
                Powered by GRP
                <strong>Liquidação em USDC</strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="signal-strip" aria-label="Resumo do produto">
        <div className="shell signal-strip__inner">
          <span>Brasil → mundo</span>
          <span>Recebível confirmado</span>
          <span>Liquidez em USDC</span>
          <span>Histórico portátil</span>
        </div>
      </section>

      <section className="section section--steps">
        <div className="shell">
          <div className="section-heading">
            <div>
              <span className="kicker">Da entrega à liquidez</span>
              <h2>Um produto brasileiro construído sobre infraestrutura global.</h2>
            </div>
            <p>
              Elas Recebem Hoje é a primeira vertical do GRP. A experiência permanece
              simples para quem recebe; o protocolo cuida do estado financeiro.
            </p>
          </div>
          <div className="steps-grid">
            {steps.map((step) => (
              <article className="step-card" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--reputation">
        <div className="shell reputation-card">
          <div>
            <span className="kicker kicker--light">Confiança que acompanha você</span>
            <h2>Receivable Passport.</h2>
            <p>
              Cada operação concluída constrói um histórico verificável de recebíveis,
              pagamentos e comportamento de liquidação.
            </p>
          </div>
          <div className="reputation-signals">
            <span><BadgeCheck aria-hidden="true" /> Recebíveis concluídos</span>
            <span><FileCheck2 aria-hidden="true" /> Histórico de liquidação</span>
            <span><Radio aria-hidden="true" /> Passport portátil</span>
          </div>
        </div>
      </section>

      <section className="section final-cta">
        <div className="shell final-cta__inner">
          <span className="kicker">Elas Recebem Hoje · powered by GRP</span>
          <h2>Transforme um pagamento futuro em liquidez hoje.</h2>
          <p>
            Cadastre um recebível e acompanhe a confirmação, validação e financiamento.
          </p>
          <ButtonLink href="/entrar?next=/recebivel">
            Entrar na plataforma <ArrowRight aria-hidden="true" size={18} />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
