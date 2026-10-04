import {
  ArrowRight,
  BadgeCheck,
  Bitcoin,
  FileCheck2,
  Globe2,
  Radio,
  Sparkles,
} from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { PoolCard } from "@/components/pool-card";
import { publicPools } from "@/data/public-pools";

const steps = [
  {
    number: "01",
    title: "Você apresenta o recebível",
    body: "Cadastre o salário, venda, comissão, serviço ou outro pagamento, com valor e data combinados com o pagador no exterior.",
  },
  {
    number: "02",
    title: "O pagador confirma e aceita BTC",
    body: "Por um link seguro, ele confirma os dados e concorda em pagar uma invoice Lightning no vencimento.",
  },
  {
    number: "03",
    title: "A plataforma valida",
    body: "Identidade, evidências, duplicidade e histórico passam por regras claras antes da pool existir.",
  },
  {
    number: "04",
    title: "Você recebe hoje",
    body: "Aportadoras completam a pool e a antecipação é enviada para sua carteira em Bitcoin.",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="shell hero__grid">
          <div className="hero__copy">
            <div className="eyebrow">
              <Sparkles aria-hidden="true" size={16} />
              Liquidez para quem tem a receber do exterior
            </div>
            <h1>
              Seu pagamento já tem data. <em>Seu dinheiro não precisa esperar.</em>
            </h1>
            <p className="hero__lead">
              Antecipe pagamentos de pagadores no exterior com uma pool financiada em
              Bitcoin — de forma clara, comunitária e focada em mulheres
              no centro.
            </p>
            <div className="hero__actions">
              <ButtonLink href="/entrar?next=/painel">
                Criar recebível <ArrowRight aria-hidden="true" size={18} />
              </ButtonLink>
              <ButtonLink href="/pools" variant="secondary">
                Ver pools abertas
              </ButtonLink>
            </div>
            <ul className="trust-list" aria-label="Princípios da plataforma">
              <li>
                <BadgeCheck aria-hidden="true" size={17} /> Validação da plataforma
              </li>
              <li>
                <Bitcoin aria-hidden="true" size={17} /> BTC via Lightning
              </li>
              <li>
                <Radio aria-hidden="true" size={17} /> Reputação portátil
              </li>
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
                  US$ 1.900 em BTC
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
                <strong>Pagamento em BTC aceito</strong>
              </span>
            </div>
            <div className="floating-note floating-note--wallet">
              <Bitcoin aria-hidden="true" size={18} />
              <span>
                Para sua carteira
                <strong>Liquidação Lightning</strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="signal-strip" aria-label="Resumo do produto">
        <div className="shell signal-strip__inner">
          <span>Brasil → mundo</span>
          <span>Recebível confirmado</span>
          <span>Pool em Bitcoin</span>
          <span>Custos transparentes</span>
        </div>
      </section>

      <section className="section section--steps">
        <div className="shell">
          <div className="section-heading">
            <div>
              <span className="kicker">Da entrega à liquidez</span>
              <h2>Quatro passos. Nenhuma promessa escondida.</h2>
            </div>
            <p>
              O pagador precisa aceitar pagar em BTC. Sem esse aceite, nenhuma pool é
              aberta e nenhum dinheiro entra na plataforma.
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

      <section className="section section--pools">
        <div className="shell pools-layout">
          <div className="pools-copy">
            <span className="kicker">Financiamento comunitário</span>
            <h2>Uma pool BTC com risco e cobertura visíveis.</h2>
            <p>Aportadoras podem financiar uma parte ou completar toda a pool. Garantia e tesouraria cobrem somente o principal, nunca rendimentos.</p>
            <ButtonLink href="/pools" variant="secondary">
              Ver todas as pools
            </ButtonLink>
          </div>
          <div className="pools-stack">
            <PoolCard pool={publicPools[0]} />
            <PoolCard pool={publicPools[1]} />
          </div>
        </div>
      </section>

      <section className="section section--reputation">
        <div className="shell reputation-card">
          <div>
            <span className="kicker kicker--light">Confiança que acompanha você</span>
            <h2>Reputação não é uma nota misteriosa.</h2>
            <p>
              Identidade, recebíveis concluídos, pagamentos e histórico aparecem como
              sinais separados. Atestados Nostr usam somente referências não sensíveis.
            </p>
          </div>
          <div className="reputation-signals">
            <span>
              <BadgeCheck aria-hidden="true" /> Identidade verificada
            </span>
            <span>
              <FileCheck2 aria-hidden="true" /> 3 operações concluídas
            </span>
            <span>
              <Radio aria-hidden="true" /> Atestado portátil
            </span>
          </div>
        </div>
      </section>

      <section className="section final-cta">
        <div className="shell final-cta__inner">
          <span className="kicker">Elas recebem hoje</span>
          <h2>O futuro do trabalho já chegou. O pagamento também pode chegar.</h2>
          <p>
            Entre com sua carteira e escolha entre criar um recebível ou aportar em uma pool BTC.
          </p>
          <ButtonLink href="/entrar?next=/painel">
            Entrar na plataforma <ArrowRight aria-hidden="true" size={18} />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
