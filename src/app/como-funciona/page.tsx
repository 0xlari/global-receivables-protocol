import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  History,
  Network,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { ButtonLink } from "@/components/button-link";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "See how GRP creates, confirms, validates, finances and settles global receivables in USDC on Solana.",
};

const stages = [
  {
    icon: CircleDollarSign,
    title: "1. Create the receivable",
    body: "Register the payment source, amount, payer and due date. Private evidence stays off-chain while its commitment can be verified on Solana.",
  },
  {
    icon: WalletCards,
    title: "2. Get payer confirmation",
    body: "The payer reviews the obligation and signs with the wallet that will settle it in USDC.",
  },
  {
    icon: ShieldCheck,
    title: "3. Validate the receivable",
    body: "An originator checks evidence, duplication, eligibility and the rules required before financing.",
  },
  {
    icon: Network,
    title: "4. Open the funding pool",
    body: "Once approved, the receivable can open a pool where investors provide USDC liquidity.",
  },
  {
    icon: CircleDollarSign,
    title: "5. Settle in USDC",
    body: "At maturity, the payer settles the remaining obligation through the wallet authorization bound to that receivable.",
  },
  {
    icon: History,
    title: "6. Update the Passport",
    body: "The outcome becomes part of the Receivable Passport, preserving on-time, late and cured-default history.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="inner-page">
      <section className="page-hero">
        <div className="shell page-hero__inner">
          <span className="eyebrow">Protocol flow</span>
          <h1>From future payment to programmable liquidity.</h1>
          <p>
            GRP turns a verified payment obligation into a financeable receivable,
            coordinates settlement in USDC and records the outcome as portable financial history.
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
            <span className="kicker">Core rule</span>
            <h2>No payer confirmation, no financing.</h2>
          </div>
          <div>
            <p>
              The payer confirmation is bound to the receivable and to the wallet
              expected to settle it. Financing only starts after validation.
            </p>
            <ButtonLink href="/recebivel" variant="secondary">
              Create a receivable <ArrowRight aria-hidden="true" size={18} />
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell protocol-proof">
          <span className="tag tag--success">
            <BadgeCheck aria-hidden="true" size={15} /> Live on Solana Devnet
          </span>
          <strong>GRP Program v1</strong>
          <span>USDC settlement · wallet-bound confirmation · Receivable Passport</span>
        </div>
      </section>
    </div>
  );
}
