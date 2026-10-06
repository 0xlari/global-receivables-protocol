import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./protocol.module.css";

export const metadata: Metadata = {
  title: "Protocol",
  description:
    "How the Global Receivables Protocol turns future payments into programmable, financeable receivables on Solana.",
};

const stages = [
  {
    number: "01",
    title: "Create the obligation.",
    body: "The requester registers the payment terms, amount, payer and due date. Sensitive evidence stays private off-chain while GRP anchors the financial state.",
    state: "Receivable · Awaiting payer",
  },
  {
    number: "02",
    title: "Bind the payer.",
    body: "The payer reviews the obligation and signs with the wallet expected to settle it. The confirmation is cryptographically tied to that receivable.",
    state: "Payer confirmed · wallet bound",
  },
  {
    number: "03",
    title: "Validate before liquidity.",
    body: "An originator checks evidence, duplication and eligibility. Only an approved receivable can become financeable.",
    state: "Validation · Approved",
  },
  {
    number: "04",
    title: "Open global liquidity.",
    body: "A receivable-specific pool opens and investors provide USDC. Funding can be partial or complete without changing the underlying obligation.",
    state: "Pool · Funding in USDC",
  },
  {
    number: "05",
    title: "Settle through one rail.",
    body: "At maturity, GRP attempts the authorized USDC settlement. If funds are unavailable, the obligation remains visible and can still be paid later.",
    state: "Settlement · Due / Paid / Overdue",
  },
  {
    number: "06",
    title: "Turn settlement into reputation.",
    body: "Every completed outcome updates the Receivable Passport with on-time performance, late payments, defaults and cured defaults.",
    state: "Passport · Updated",
  },
];

export default function ProtocolPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.kicker}>GLOBAL RECEIVABLES PROTOCOL / HOW IT WORKS</span>
          <h1>One obligation.<br />One programmable financial state.</h1>
          <p>
            GRP coordinates the full lifecycle of a global receivable — from payer
            confirmation to financing, settlement and portable financial history.
          </p>
          <div className={styles.heroMeta}>
            <span>Solana Devnet</span>
            <span>USDC settlement</span>
            <span>Wallet-bound confirmation</span>
            <span>Receivable Passport</span>
          </div>
        </div>
      </section>

      <section className={styles.flow}>
        {stages.map((stage) => (
          <article className={styles.scene} key={stage.number}>
            <span className={styles.sceneNumber}>{stage.number}</span>
            <div className={styles.sceneMain}>
              <h2>{stage.title}</h2>
              <p>{stage.body}</p>
            </div>
            <div className={styles.sceneState}>
              <small>Protocol state</small>
              <strong>{stage.state}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.architecture}>
        <div className={styles.architectureInner}>
          <span className={styles.kicker}>ARCHITECTURE</span>
          <h2>Private evidence off-chain. Financial truth on Solana.</h2>
          <div className={styles.layers}>
            <article className={styles.layer}>
              <small>PRIVATE LAYER</small>
              <h3>Evidence + identity</h3>
              <p>PII, contracts and commercial documents remain private in the application layer.</p>
            </article>
            <article className={styles.layer}>
              <small>GRP</small>
              <h3>Receivable state machine</h3>
              <p>Confirmation, validation, pools, settlement rules and Passport outcomes are coordinated by the protocol.</p>
            </article>
            <article className={styles.layer}>
              <small>SOLANA</small>
              <h3>Canonical financial state</h3>
              <p>Verifiable accounts and USDC settlement create a composable record of the receivable lifecycle.</p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.rule}>
        <div>
          <span className={styles.kicker}>CORE RULES</span>
          <h2>No verification, no financing.</h2>
        </div>
        <div className={styles.rulePanel}>
          <div><span>01</span><p>Payer confirmation must be bound to the wallet expected to settle.</p></div>
          <div><span>02</span><p>Only validated receivables can open a funding pool.</p></div>
          <div><span>03</span><p>Settlement never erases late-payment or default history.</p></div>
          <div><span>04</span><p>Private documents do not need to become public blockchain data.</p></div>
        </div>
      </section>

      <section className={styles.live}>
        <div>
          <span className={styles.kicker}>LIVE PROTOCOL</span>
          <h2>Deployed, configured and active on Devnet.</h2>
        </div>
        <dl className={styles.liveFacts}>
          <div><dt>Network</dt><dd>Solana Devnet</dd></div>
          <div><dt>Settlement asset</dt><dd>USDC</dd></div>
          <div><dt>Program status</dt><dd>Active</dd></div>
          <div><dt>Version</dt><dd>v1</dd></div>
        </dl>
      </section>

      <section className={styles.cta}>
        <span className={styles.kicker}>RUN THE FLOW</span>
        <h2>Create it. Verify it. Finance it. Settle it.</h2>
        <p>Move from protocol explanation to the live GRP application.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/entrar?next=/recebivel">
            Create receivable <ArrowRight size={18} />
          </Link>
          <Link className={styles.secondary} href="/">Back to globe</Link>
        </div>
      </section>
    </div>
  );
}
