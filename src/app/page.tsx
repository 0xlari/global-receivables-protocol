import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  FileCheck2,
  Globe2,
  History,
  Landmark,
  Network,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { ButtonLink } from "@/components/button-link";

const steps = [
  {
    number: "01",
    title: "Create",
    body: "Register a receivable while keeping sensitive documents and personal data off-chain.",
  },
  {
    number: "02",
    title: "Confirm",
    body: "The payer confirms the obligation with the wallet that will settle it.",
  },
  {
    number: "03",
    title: "Validate",
    body: "An originator verifies the receivable before it becomes eligible for financing.",
  },
  {
    number: "04",
    title: "Fund",
    body: "Investors provide USDC liquidity through a receivable-specific pool.",
  },
  {
    number: "05",
    title: "Settle",
    body: "The payer settles in USDC through the authorization attached to the receivable.",
  },
  {
    number: "06",
    title: "Build reputation",
    body: "Settlement outcomes update a portable Receivable Passport on Solana.",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="shell hero__grid">
          <div className="hero__copy">
            <div className="eyebrow">
              <Network aria-hidden="true" size={16} />
              Global Receivables Protocol
            </div>
            <h1>
              Turn future payments into <em>programmable, financeable receivables.</em>
            </h1>
            <p className="hero__lead">
              Create, validate, finance and settle global receivables in USDC on Solana
              while building a portable payment history.
            </p>
            <div className="hero__actions">
              <ButtonLink href="/entrar?next=/recebivel">
                Create a receivable <ArrowRight aria-hidden="true" size={18} />
              </ButtonLink>
              <ButtonLink href="#how-it-works" variant="secondary">
                Explore the protocol
              </ButtonLink>
            </div>
            <ul className="trust-list" aria-label="Protocol properties">
              <li><BadgeCheck aria-hidden="true" size={17} /> Verifiable receivables</li>
              <li><CircleDollarSign aria-hidden="true" size={17} /> USDC settlement</li>
              <li><History aria-hidden="true" size={17} /> Portable payment history</li>
            </ul>
          </div>

          <div className="hero-board" aria-label="Global receivable example">
            <div className="hero-board__halo" aria-hidden="true" />
            <div className="receipt-card">
              <div className="receipt-card__head">
                <span className="tag tag--success">
                  <FileCheck2 aria-hidden="true" size={15} /> Verified receivable
                </span>
                <span className="receipt-card__id">GRP-001</span>
              </div>
              <p>Global service payment</p>
              <strong>US$ 2,000</strong>
              <div className="receipt-card__rows">
                <span>
                  <small>Advance</small>
                  1,900 USDC
                </span>
                <span>
                  <small>Settlement</small>
                  Due in 30 days
                </span>
              </div>
            </div>
            <div className="floating-note floating-note--client">
              <WalletCards aria-hidden="true" size={18} />
              <span>
                Payer confirmation
                <strong>Wallet-bound obligation</strong>
              </span>
            </div>
            <div className="floating-note floating-note--wallet">
              <Landmark aria-hidden="true" size={18} />
              <span>
                Settlement rail
                <strong>USDC on Solana</strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="signal-strip" aria-label="Protocol summary">
        <div className="shell signal-strip__inner">
          <span>Global receivables</span>
          <span>Payer confirmed</span>
          <span>USDC liquidity</span>
          <span>Portable history</span>
        </div>
      </section>

      <section className="section section--steps" id="how-it-works">
        <div className="shell">
          <div className="section-heading">
            <div>
              <span className="kicker">How GRP works</span>
              <h2>From future payment to verifiable financial history.</h2>
            </div>
            <p>
              GRP coordinates the receivable lifecycle while keeping sensitive commercial
              data private and the canonical financial state on Solana.
            </p>
          </div>
          <div className="steps-grid">
            {steps.slice(0, 4).map((step) => (
              <article className="step-card" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
          <div className="steps-grid">
            {steps.slice(4).map((step) => (
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
            <span className="kicker kicker--light">Receivable Passport</span>
            <h2>A financial history that travels with you.</h2>
            <p>
              Every settled receivable adds verifiable performance data to the Receivable
              Passport, including on-time payments, late settlements, defaults and cured defaults.
            </p>
          </div>
          <div className="reputation-signals">
            <span><BadgeCheck aria-hidden="true" /> Settled on time</span>
            <span><History aria-hidden="true" /> Late and cured outcomes</span>
            <span><Globe2 aria-hidden="true" /> Portable across GRP applications</span>
          </div>
        </div>
      </section>

      <section className="section section--pools">
        <div className="shell pools-layout">
          <div className="pools-copy">
            <span className="kicker">Why Solana</span>
            <h2>Fast settlement, global USDC liquidity, composable financial state.</h2>
            <p>
              Solana is the canonical financial layer of GRP. Sensitive documents, identity
              information and commercial evidence stay private off-chain.
            </p>
          </div>
          <div className="reputation-signals">
            <span><CircleDollarSign aria-hidden="true" /> USDC-native settlement</span>
            <span><Network aria-hidden="true" /> Programmable receivable lifecycle</span>
            <span><ShieldCheck aria-hidden="true" /> Private data stays off-chain</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-heading">
          <div>
            <span className="kicker">Built on GRP</span>
            <h2>Elas Recebem Hoje is the first vertical powered by the protocol.</h2>
          </div>
          <p>
            The Brazilian application focuses on professionals receiving income from global
            clients, proving that GRP can power real receivable products for specific markets.
          </p>
        </div>
      </section>

      <section className="section section--reputation">
        <div className="shell reputation-card">
          <div>
            <span className="kicker kicker--light">Live protocol</span>
            <h2>GRP is live on Solana Devnet.</h2>
            <p>
              The deployed program is already configured for USDC settlement and the protocol
              lifecycle is being tested end to end through the application.
            </p>
          </div>
          <div className="reputation-signals">
            <span><Network aria-hidden="true" /> Solana Devnet</span>
            <span><BadgeCheck aria-hidden="true" /> Protocol version 1</span>
            <span><CircleDollarSign aria-hidden="true" /> USDC settlement</span>
          </div>
        </div>
      </section>

      <section className="section final-cta">
        <div className="shell final-cta__inner">
          <span className="kicker">Global Receivables Protocol</span>
          <h2>Create your first global receivable.</h2>
          <p>
            Register a future payment, get payer confirmation and turn it into a financeable
            on-chain receivable.
          </p>
          <ButtonLink href="/entrar?next=/recebivel">
            Create receivable <ArrowRight aria-hidden="true" size={18} />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
