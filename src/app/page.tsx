import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleDollarSign, History } from "lucide-react";
import styles from "./grp.module.css";

const flow = [
  ["01", "Create", "Register a receivable while keeping private evidence off-chain."],
  ["02", "Confirm", "Bind the obligation to the payer wallet that will settle it."],
  ["03", "Validate", "Verify evidence, eligibility and duplication before financing."],
  ["04", "Fund", "Open a receivable-specific pool and provide USDC liquidity."],
  ["05", "Settle", "Collect or manually settle the obligation in USDC at maturity."],
  ["06", "Build reputation", "Write the outcome into a portable Receivable Passport."],
];

export default function Home() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={`${styles.shell} ${styles.heroGrid}`}>
          <div>
            <div className={styles.kicker}>
              <span className={styles.liveDot} />
              Global Receivables Protocol · Solana Devnet
            </div>
            <h1 className={styles.title}>
              Turn future payments into
              <span className={styles.titleAccent}> programmable receivables.</span>
            </h1>
            <p className={styles.lead}>
              GRP is infrastructure for creating, confirming, financing and settling
              global receivables in USDC while building portable payment history.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/entrar?next=/recebivel">
                Create receivable <ArrowRight size={18} />
              </Link>
              <Link className={styles.secondary} href="/como-funciona">
                Explore protocol
              </Link>
            </div>
            <div className={styles.meta}>
              <span><BadgeCheck size={15} /> Verifiable obligations</span>
              <span><CircleDollarSign size={15} /> USDC settlement</span>
              <span><History size={15} /> Receivable Passport</span>
            </div>
          </div>

          <div className={styles.protocolPanel}>
            <div className={styles.panelCard}>
              <div className={styles.panelTop}>
                <span className={styles.verified}>● VERIFIED RECEIVABLE</span>
                <span className={styles.receivableId}>GRP-001</span>
              </div>
              <p className={styles.amountLabel}>Settlement amount</p>
              <p className={styles.amount}>2,000 USDC</p>
              <div className={styles.states}>
                <div className={styles.state}><small>Payer</small><strong>Confirmed ✓</strong></div>
                <div className={styles.state}><small>Originator</small><strong>Validated ✓</strong></div>
                <div className={styles.state}><small>Funding</small><strong>72% funded</strong></div>
                <div className={styles.state}><small>Settlement</small><strong>Due in 30 days</strong></div>
              </div>
            </div>
            <div className={styles.progressWrap}>
              <div className={styles.progressHead}>
                <span>Pool liquidity</span>
                <span>1,440 / 2,000 USDC</span>
              </div>
              <div className={styles.progress}><span /></div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.strip}>
        <div className={`${styles.shell} ${styles.stripInner}`}>
          <span>Wallet-bound confirmation</span>
          <span>USDC liquidity</span>
          <span>Canonical Solana state</span>
          <span>Portable reputation</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.kicker}>Protocol lifecycle</span>
              <h2>One financial state from obligation to settlement.</h2>
            </div>
            <p>
              GRP separates sensitive commercial data from the public financial state,
              so the receivable can be verified and financed without putting private
              documents on-chain.
            </p>
          </div>
          <div className={styles.flowGrid}>
            {flow.map(([index, title, body]) => (
              <article className={styles.flowCard} key={index}>
                <span className={styles.flowIndex}>{index}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.passport}`}>
        <div className={`${styles.shell} ${styles.passportGrid}`}>
          <div>
            <span className={styles.kicker}>Receivable Passport</span>
            <h2>A financial history that moves with the requester.</h2>
            <p className={styles.lead}>
              Every settlement updates an on-chain history of created receivables,
              on-time payments, late outcomes, defaults and cured defaults.
            </p>
          </div>
          <div className={styles.passportStats}>
            <div className={styles.passportStat}><small>Receivables settled</small><strong>12</strong></div>
            <div className={styles.passportStat}><small>On-time rate</small><strong>91.7%</strong></div>
            <div className={styles.passportStat}><small>Defaults cured</small><strong>1</strong></div>
            <div className={styles.passportStat}><small>Total settled</small><strong>48,200 USDC</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.vertical}>
        <div className={`${styles.shell} ${styles.verticalGrid}`}>
          <div>
            <span className={styles.kicker} style={{ color: "#c63d28" }}>Built on GRP</span>
            <h2>Infrastructure first. Real application from day one.</h2>
            <p>
              Elas Recebem Hoje is the first Brazilian vertical powered by GRP,
              focused on professionals receiving income from global clients.
            </p>
          </div>
          <div className={styles.verticalCard}>
            <span className={styles.verticalMark}>E</span>
            <h3>Elas Recebem Hoje</h3>
            <p>Antecipação de recebíveis internacionais para profissionais no Brasil.</p>
            <Link className={styles.verticalLink} href="/elas-recebem-hoje">
              Open the Brazilian vertical <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.live}>
        <div className={`${styles.shell} ${styles.liveGrid}`}>
          <div>
            <span className={styles.kicker}><span className={styles.liveDot} /> Live protocol</span>
            <h2>Deployed and active on Solana Devnet.</h2>
            <p>
              The protocol config is initialized and the application is wired to test
              the receivable lifecycle against the deployed GRP program.
            </p>
          </div>
          <div className={styles.liveFacts}>
            <div className={styles.liveFact}><span>Network</span><strong>Solana Devnet</strong></div>
            <div className={styles.liveFact}><span>Settlement asset</span><strong>USDC</strong></div>
            <div className={styles.liveFact}><span>Program status</span><strong>Active</strong></div>
            <div className={styles.liveFact}><span>Protocol version</span><strong>v1</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.final}>
        <div className={`${styles.shell} ${styles.finalInner}`}>
          <span className={styles.kicker}>Global Receivables Protocol</span>
          <h2>Create a receivable. Make it verifiable. Make it financeable.</h2>
          <p>Start the first live flow through GRP on Solana Devnet.</p>
          <div className={styles.actions} style={{ justifyContent: "center" }}>
            <Link className={styles.primary} href="/entrar?next=/recebivel">
              Create receivable <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
