import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { GRP_MARKETS, MARKET_LIFECYCLE } from "@/config/grp-markets";
import styles from "../market-system.module.css";

export const metadata: Metadata = {
  title: "Markets",
  description: "Explore receivables markets powered by the Global Receivables Protocol.",
};

function pct(bps: number) {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 1) + "%";
}

export default function MarketsPage() {
  const active = GRP_MARKETS.find((market) => market.slug === "elas-recebem-hoje")!;
  const sandbox = GRP_MARKETS.find((market) => market.slug === "grp-direct")!;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.kicker}>GRP MARKET DIRECTORY</span>
          <h1>One protocol.<br />Markets built for real communities.</h1>
          <p>
            Each Market adapts GRP to a specific audience, geography and operating
            model while sharing the same settlement state and portable Receivable Passport.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={active.publicEntry ?? "/markets"}>
              Open first Market <ArrowRight size={18}/>
            </Link>
            <Link className={styles.secondary} href="/build-on-grp">Build on GRP</Link>
          </div>
        </div>
      </section>

      <section className={styles.directory}>
        <div className={styles.directoryInner}>
          <span className={styles.eyebrow}>ACTIVE + SANDBOX</span>
          <h2 className={styles.directoryTitle}>Choose the market context.</h2>
          <p className={styles.directoryIntro}>
            GRP itself is infrastructure. Receivables are originated inside a Market so
            the operator, local responsibilities, rules and economics are explicit.
          </p>

          <div className={styles.marketGrid}>
            <article className={styles.marketCard}>
              <div className={styles.marketTop}>
                <span>MARKET 01 · {active.geography.toUpperCase()}</span>
                <span className={styles.status}>{active.status}</span>
              </div>
              <h2>{active.name}</h2>
              <p>{active.description}</p>
              <div className={styles.marketMeta}>
                <span>Operator</span><strong>{active.operator}</strong>
                <span>Settlement</span><strong>{active.settlementAsset}</strong>
                <span>Advance</span><strong>{pct(active.economics!.advanceBps)}</strong>
                <span>Investor return</span><strong>{pct(active.economics!.investorReturnBps)}</strong>
                <span>Market fee</span><strong>{pct(active.economics!.marketFeeBps)}</strong>
                <span>GRP fee</span><strong>{pct(active.economics!.protocolFeeBps)}</strong>
              </div>
              <div className={styles.marketActions}>
                <Link className={styles.primary} href={active.publicEntry!}>
                  Enter Market <ArrowRight size={17}/>
                </Link>
              </div>
            </article>

            <article className={styles.marketCard + " " + styles.marketCardMuted}>
              <div className={styles.marketTop}>
                <span>PROTOCOL SANDBOX</span>
                <span>{sandbox.status}</span>
              </div>
              <h2>{sandbox.name}</h2>
              <p>{sandbox.description}</p>
              <div className={styles.marketMeta}>
                <span>Operator</span><strong>{sandbox.operator}</strong>
                <span>Geography</span><strong>{sandbox.geography}</strong>
                <span>Settlement</span><strong>{sandbox.settlementAsset}</strong>
                <span>Rules</span><strong>{sandbox.rulesVersion}</strong>
                <span>Public origination</span><strong>Disabled</strong>
              </div>
              <div className={styles.marketActions}>
                <Link className={styles.secondary} href="/build-on-grp">
                  Propose a Market <ArrowRight size={17}/>
                </Link>
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
            <p>
              Market Operators own local execution. GRP owns the common financial state,
              settlement primitives and portable Passport.
            </p>
          </div>
          <div className={styles.marketRail}>
            <div><span>Origination + validation</span><strong>Market Operator</strong></div>
            <div><span>Local operations + rails</span><strong>Market Operator</strong></div>
            <div><span>Settlement state</span><strong>GRP / Solana</strong></div>
            <div><span>Portable history</span><strong>Receivable Passport</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLead}>
            <div>
              <span className={styles.eyebrow}>MARKET LIFECYCLE</span>
              <h2>Markets can be activated, paused and retired without erasing history.</h2>
            </div>
            <p>
              A Market status controls new activity. Existing receivables and Passport
              history remain auditable even when origination is paused or retired.
            </p>
          </div>
          <div className={styles.process}>
            {MARKET_LIFECYCLE.map((item, index) => (
              <article key={item.status}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{item.label}</h3>
                <p>{item.meaning}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
