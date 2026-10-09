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
  ["02","Review","GRP reviews operator capacity, underwriting, money flow, controls and declared local responsibilities."],
  ["03","Sandbox","Approved candidates start with controlled limits while rules, rails and operations are validated."],
  ["04","Activate","Rules, operator responsibilities, economics and settlement configuration are approved for the Market."],
  ["05","Operate","The Market can originate eligible receivables while performance and incidents remain observable."],
  ["06","Pause / retire","New origination can stop without deleting existing receivables or Passport history."],
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
            <article className={styles.role}><small>LOCAL LAYER</small><h3>Market Operator</h3><p>Distribution, origination, eligibility and validation rules, customer operations, local rails, compliance coordination and the responsibilities declared for that Market.</p></article>
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
          <p style={{color:"#8e988f",lineHeight:1.7}}>Operators can charge an approved Market fee for the operating layer they provide. GRP captures its separate protocol fee on successful settlement. The two economics are explicit and auditable.</p>
        </div>
        <div className={styles.feeCard}>
          <strong>0.50%</strong>
          <span>GRP protocol fee on successful settlement</span>
          <p>Transparent protocol economics, separate from the operator&apos;s own approved fee.</p>
          <dl className={styles.feeRows}>
            <div><dt>GRP protocol fee</dt><dd>0.50% settled face value</dd></div>
            <div><dt>Operator economics</dt><dd>Market-specific and approved</dd></div>
            <div><dt>Requester residual</dt><dd>Returned after settlement</dd></div>
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
            <p className={styles.formNote}>This proposal flow documents the information required to evaluate a Market. For the hackathon MVP, proposals are reviewed manually before any database or on-chain activation. A form submission alone never activates a Market.</p>
            <button className={styles.disabledSubmit} type="button" disabled>Manual review required for activation</button>
          </form>
        </div>
      </section>
    </div>
  );
}
