import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "../market-system.module.css";

export const metadata: Metadata = {
  title: "Build on GRP",
  description: "Propose and operate a specialized receivables market on the Global Receivables Protocol.",
};

const process = [
  ["01","Propose","Define the audience, geography, receivable type, operator, rails and operating model."],
  ["02","Due diligence","GRP reviews operator capacity, underwriting, money flow, controls and local responsibilities."],
  ["03","Sandbox","Approved candidates start with controlled limits while the operating model is validated."],
  ["04","Approval","Rules, operator responsibilities, rails and economics are approved for the Market."],
  ["05","Launch","The Market becomes discoverable and can originate receivables through GRP."],
  ["06","Monitor","Performance, incidents, rails and operating obligations remain under ongoing review."],
];

export default function BuildOnGrpPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.kicker}>BUILD ON GRP / MARKET OPERATORS</span>
          <h1>Bring a market.<br />GRP brings the rails.</h1>
          <p>Build a specialized receivables market for a community, industry or geography without rebuilding settlement, financial state and portable history from zero.</p>
          <div className={styles.actions}>
            <a className={styles.primary} href="#propose">Propose a Market <ArrowRight size={18}/></a>
            <Link className={styles.secondary} href="/markets">Explore Markets</Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLead}>
            <div><span className={styles.eyebrow}>THE MODEL</span><h2>Local knowledge. Shared infrastructure.</h2></div>
            <p>GRP is global, but receivables are local in how they are originated, validated, distributed and connected to payment rails. Market Operators provide that local operating layer while GRP provides the common protocol.</p>
          </div>
          <div className={styles.roles}>
            <article className={styles.role}><small>PROTOCOL</small><h3>GRP</h3><p>Canonical receivable state, USDC settlement, Passport, market registry and shared infrastructure.</p></article>
            <article className={styles.role}><small>LOCAL LAYER</small><h3>Market Operator</h3><p>Distribution, origination, underwriting, customer operation and the local responsibilities declared for that Market.</p></article>
            <article className={styles.role}><small>PAYMENT INFRA</small><h3>Rail Provider</h3><p>Approved crypto-native, fiat or hybrid rails used by a Market where appropriate.</p></article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLead}>
            <div><span className={styles.eyebrow}>MARKET LIFECYCLE</span><h2>Anyone can propose. Approved operators launch.</h2></div>
            <p>A proposal does not activate a Market automatically. Each candidate moves through review, a controlled sandbox and approval before becoming active.</p>
          </div>
          <div className={styles.process}>
            {process.map(([n,t,b]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{b}</p></article>)}
          </div>
        </div>
      </section>

      <section className={styles.section + " " + styles.economics}>
        <div>
          <span className={styles.eyebrow}>ECONOMICS</span>
          <h2>Operators grow a market. GRP grows the infrastructure.</h2>
          <p style={{color:"#8e988f",lineHeight:1.7}}>Operators can charge for the services they provide. GRP captures protocol economics on successful activity and fixed fees for market activation and maintenance.</p>
        </div>
        <div className={styles.feeCard}>
          <strong>0.50%</strong>
          <span>GRP protocol fee on successful settlement</span>
          <p>Transparent protocol economics, separate from the operator&apos;s own approved fee.</p>
          <dl className={styles.feeRows}>
            <div><dt>Market activation</dt><dd>Fixed fee</dd></div>
            <div><dt>Market maintenance</dt><dd>Recurring fixed fee</dd></div>
            <div><dt>Operator economics</dt><dd>Market-specific</dd></div>
          </dl>
        </div>
      </section>

      <section id="propose" className={styles.apply}>
        <div className={styles.applyInner}>
          <span className={styles.eyebrow}>PROPOSE A MARKET</span>
          <h2>Start with the market you understand best.</h2>
          <form className={styles.formShell}>
            <label className={styles.field}>Market name<input name="marketName" placeholder="e.g. LATAM Export Receivables" /></label>
            <label className={styles.field}>Primary geography<input name="geography" placeholder="Country or region" /></label>
            <label className={styles.field}>Target audience<input name="audience" placeholder="Who is this market for?" /></label>
            <label className={styles.field}>Operator / organization<input name="operator" placeholder="Who will operate the market?" /></label>
            <label className={styles.field}>Rail model<select name="rail"><option>Crypto-native</option><option>Fiat</option><option>Hybrid</option></select></label>
            <label className={styles.field}>Settlement asset<input name="asset" defaultValue="USDC" /></label>
            <label className={styles.field + " " + styles.fieldWide}>Operating model<textarea name="model" placeholder="Receivable types, validation, local rails, partners and responsibilities." /></label>
            <p className={styles.formNote}>This proposal flow is presented for the hackathon product experience. Submissions are not persisted yet; production onboarding will include identity, operational and jurisdiction-specific review.</p>
            <button className={styles.disabledSubmit} type="button" disabled>Proposal submission coming next</button>
          </form>
        </div>
      </section>
    </div>
  );
}
