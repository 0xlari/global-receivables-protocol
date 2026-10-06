"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, MousePointer2 } from "lucide-react";
import styles from "@/app/grp.module.css";

const stages = [
  {
    eyebrow: "01 · CREATE",
    title: "Create the obligation.",
    body: "The requester registers amount, payer and due date. Sensitive evidence stays private off-chain while GRP creates the receivable state.",
    metric: "Receivable · Awaiting payer",
  },
  {
    eyebrow: "02 · CONFIRM",
    title: "Bind the payer.",
    body: "The payer signs with the wallet expected to settle. Confirmation becomes part of the verifiable state of that receivable.",
    metric: "Payer confirmed · wallet bound",
  },
  {
    eyebrow: "03 · VALIDATE",
    title: "Validate before liquidity.",
    body: "An originator checks evidence, duplication and eligibility. Only approved receivables can become financeable.",
    metric: "Validation · Approved",
  },
  {
    eyebrow: "04 · FUND",
    title: "Open global liquidity.",
    body: "A receivable-specific pool opens and investors provide USDC. Funding may be partial or complete.",
    metric: "Pool · Funding in USDC",
  },
  {
    eyebrow: "05 · SETTLE",
    title: "Settle through one rail.",
    body: "At maturity, GRP attempts USDC settlement. If funds are unavailable, the obligation remains visible and can still be paid later.",
    metric: "Settlement · Due / Paid / Overdue",
  },
  {
    eyebrow: "06 · PASSPORT",
    title: "Turn settlement into reputation.",
    body: "Every outcome updates the Receivable Passport with on-time performance, late payments, defaults and cured defaults.",
    metric: "Passport · Updated",
  },
];

function TechnicalGlobe({ active }: { active: number }) {
  return (
    <div className={styles.globeWrap} aria-hidden="true">
      <div className={styles.globeGlow} />
      <svg className={styles.globe} viewBox="0 0 620 620">
        <defs>
          <clipPath id="grp-protocol-globe"><circle cx="310" cy="310" r="242" /></clipPath>
          <radialGradient id="grp-protocol-fill" cx="38%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#143a23" />
            <stop offset="58%" stopColor="#07140d" />
            <stop offset="100%" stopColor="#030805" />
          </radialGradient>
        </defs>

        <circle cx="310" cy="310" r="242" fill="url(#grp-protocol-fill)" stroke="#70ff8c" strokeOpacity=".68" strokeWidth="2" />
        <g clipPath="url(#grp-protocol-globe)">
          {[145,205,265,325,385,445,505].map((x) => (
            <ellipse key={x} cx={x} cy="310" rx="66" ry="242" fill="none" stroke="#59e878" strokeOpacity=".24" strokeWidth="1.2" />
          ))}
          {[140,195,250,310,370,425,480].map((y) => (
            <ellipse key={y} cx="310" cy="310" rx="242" ry={Math.max(28, Math.abs(y-310)*.42+36)} fill="none" stroke="#59e878" strokeOpacity=".2" strokeWidth="1" transform={`translate(0 ${y-310})`} />
          ))}
          <path d="M164 213l28-24 32 4 18-16 26 13 13 32-18 27-29 7-15 24-32-11-16-23-20-7z" className={styles.land} />
          <path d="M229 304l31 16 25 28-5 28 17 29-12 47-25 42-15-16 5-37-21-25-11-39 7-30-13-27z" className={styles.land} />
          <path d="M355 183l37-16 48 13 22 25 45 9 17 28-25 18-33-7-26 24-36-12-24 16-24-18-21-4-9-31z" className={styles.land} />
          <path d="M366 281l33 5 31 28-4 41-20 38-23 32-21-8-13-38-16-34 9-34z" className={styles.land} />
        </g>

        <circle className={styles.node} cx="250" cy="365" r="7" />
        {active >= 1 && <circle className={styles.node} cx="208" cy="236" r="7" />}
        {active >= 1 && <path className={styles.route} d="M250 365 Q205 286 208 236" />}
        {active >= 3 && <path className={styles.routeSoft} d="M250 365 Q330 325 385 284" />}
        {active >= 3 && <path className={styles.routeSoft} d="M250 365 Q365 390 458 410" />}
        {active >= 4 && <path className={styles.routeReverse} d="M208 236 Q205 286 250 365" />}
        {active >= 5 && <circle className={styles.passportRing} cx="250" cy="365" r="25" />}
      </svg>

      <div className={styles.globeLabel}>
        <span>PROTOCOL STATE</span>
        <strong>{stages[active].metric}</strong>
      </div>
    </div>
  );
}

export function GrpProtocolExperience() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = Number((visible.target as HTMLElement).dataset.scene);
        if (Number.isFinite(index)) setActive(index);
      },
      { threshold: [0.3, 0.5, 0.75], rootMargin: "-18% 0px -18% 0px" },
    );
    refs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.page}>
      <section className={styles.opening}>
        <div className={styles.openingNoise} />
        <div className={styles.openingTop}>
          <span>GLOBAL RECEIVABLES PROTOCOL</span>
          <span className={styles.live}><i /> PROTOCOL / V1</span>
        </div>
        <div className={styles.openingCenter}>
          <p className={styles.openingOverline}>HOW THE PROTOCOL WORKS</p>
          <h1>One obligation.<br />One programmable financial state.</h1>
          <p>
            Follow the receivable from creation to settlement and see what GRP records,
            what stays private and when liquidity becomes available.
          </p>
          <div className={styles.openingActions}>
            <a href="#protocol-flow" className={styles.signalButton}>Run the lifecycle <ArrowDown size={18} /></a>
            <Link href="/" className={styles.ghostButton}>Back to globe</Link>
          </div>
        </div>
        <div className={styles.openingHint}><ArrowDown size={15} /> scroll through the state machine</div>
      </section>

      <section id="protocol-flow" className={styles.world}>
        <div className={styles.worldSticky}>
          <div className={styles.worldHeader}>
            <span>GRP / RECEIVABLE STATE MACHINE</span>
            <span>SCROLL TO ADVANCE STATE</span>
          </div>
          <div className={styles.globeStage}>
            <TechnicalGlobe active={active} />
            <div className={styles.dragHint}><MousePointer2 size={15} /> canonical state</div>
          </div>
          <div className={styles.sceneCounter}>0{active + 1} / 06</div>
        </div>

        <div className={styles.sceneRail}>
          {stages.map((stage, index) => (
            <article
              className={styles.scene}
              data-scene={index}
              key={stage.eyebrow}
              ref={(node) => { refs.current[index] = node; }}
            >
              <div className={styles.sceneCopy}>
                <span>{stage.eyebrow}</span>
                <h2>{stage.title}</h2>
                <p>{stage.body}</p>
                <strong>{stage.metric}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.statement}>
        <div className={styles.statementGrid}>
          <span>ARCHITECTURE</span>
          <h2>Private evidence off-chain.<br />Financial truth on Solana.</h2>
          <p>
            PII, contracts and commercial evidence remain private. GRP coordinates
            receivable, validation, pool, settlement and Passport accounts as the
            canonical financial state.
          </p>
        </div>
      </section>

      <section className={styles.passportScene}>
        <div className={styles.passportOrbit}>
          <div className={styles.passportCore}>
            <span>THREE LAYERS</span>
            <strong>GRP</strong>
            <small>state machine</small>
          </div>
          <div className={styles.passportChip} data-pos="one"><small>private layer</small><strong>Evidence + PII</strong></div>
          <div className={styles.passportChip} data-pos="two"><small>protocol</small><strong>Rules + state</strong></div>
          <div className={styles.passportChip} data-pos="three"><small>solana</small><strong>USDC + accounts</strong></div>
        </div>
        <div className={styles.passportCopy}>
          <span>CORE DESIGN</span>
          <h2>Verification without exposing the business.</h2>
          <p>
            The protocol makes the financial lifecycle inspectable without publishing
            sensitive source documents.
          </p>
        </div>
      </section>

      <section className={styles.proof}>
        <div>
          <span className={styles.proofLive}><i /> CORE RULES</span>
          <h2>No verification.<br />No financing.</h2>
        </div>
        <dl>
          <div><dt>Payer confirmation</dt><dd>Wallet-bound</dd></div>
          <div><dt>Funding</dt><dd>Only after validation</dd></div>
          <div><dt>Settlement</dt><dd>USDC on Solana</dd></div>
          <div><dt>History</dt><dd>Late/default outcomes persist</dd></div>
        </dl>
      </section>

      <section className={styles.close}>
        <span>LIVE PROTOCOL · SOLANA DEVNET</span>
        <h2>See the state machine<br />become a real receivable.</h2>
        <Link href="/entrar?next=/recebivel" className={styles.signalButton}>
          Create a receivable <ArrowRight size={18} />
        </Link>
      </section>
    </div>
  );
}
