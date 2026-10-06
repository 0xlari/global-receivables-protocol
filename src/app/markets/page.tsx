import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "../market-system.module.css";

export const metadata: Metadata = {
  title: "Markets",
  description: "Explore receivables markets powered by the Global Receivables Protocol.",
};

export default function MarketsPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.kicker}>GRP MARKET DIRECTORY</span>
          <h1>One protocol.<br />Markets built for real communities.</h1>
          <p>Each Market adapts GRP to a specific audience, geography and operating model while sharing the same protocol primitives and portable financial history.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/elas-recebem-hoje">Open first Market <ArrowRight size={18}/></Link>
            <Link className={styles.secondary} href="/build-on-grp">Build on GRP</Link>
          </div>
        </div>
      </section>

      <section className={styles.directory}>
        <div className={styles.directoryInner}>
          <span className={styles.eyebrow}>ACTIVE + UPCOMING</span>
          <h2 className={styles.directoryTitle}>Choose the market context.</h2>
          <p className={styles.directoryIntro}>Receivables are created inside a Market so the applicable operator, rails, rules and economics are explicit from the beginning.</p>

          <div className={styles.marketGrid}>
            <article className={styles.marketCard}>
              <div className={styles.marketTop}><span>MARKET 01 · BRAZIL</span><span className={styles.status}>ACTIVE</span></div>
              <h2>Elas Recebem Hoje</h2>
              <p>International receivables financing for professionals in Brazil receiving from global clients.</p>
              <div className={styles.marketMeta}>
                <span>Geography</span><strong>Brazil</strong>
                <span>Settlement</span><strong>USDC</strong>
                <span>Protocol fee</span><strong>0.50%</strong>
                <span>Protocol</span><strong>GRP v1</strong>
              </div>
              <div className={styles.marketActions}>
                <Link className={styles.primary} href="/elas-recebem-hoje">Enter Market <ArrowRight size={17}/></Link>
              </div>
            </article>

            <article className={styles.marketCard + " " + styles.marketCardMuted}>
              <div className={styles.marketTop}><span>NEXT MARKET</span><span>OPEN FOR PROPOSALS</span></div>
              <h2>New markets start with operators.</h2>
              <p>GRP can support new communities, industries and geographies as qualified operators bring local distribution, validation and rails.</p>
              <div className={styles.marketMeta}>
                <span>Status</span><strong>Proposal stage</strong>
                <span>Entry</span><strong>Review + sandbox</strong>
                <span>Rails</span><strong>Approved per Market</strong>
                <span>Launch</span><strong>After approval</strong>
              </div>
              <div className={styles.marketActions}>
                <Link className={styles.secondary} href="/build-on-grp">Propose a Market <ArrowRight size={17}/></Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.marketHero}>
        <div className={styles.marketHeroInner}>
          <div>
            <span className={styles.eyebrow}>SHARED PROTOCOL / LOCAL MARKETS</span>
            <h2>The market changes. The financial history stays portable.</h2>
            <p>A requester can build verifiable performance across different GRP Markets instead of starting from zero every time they enter a new vertical.</p>
          </div>
          <div className={styles.marketRail}>
            <div><span>Identity</span><strong>Wallet / application layer</strong></div>
            <div><span>History</span><strong>Receivable Passport</strong></div>
            <div><span>Market rules</span><strong>Market-specific</strong></div>
            <div><span>Settlement state</span><strong>GRP / Solana</strong></div>
          </div>
        </div>
      </section>
    </div>
  );
}
