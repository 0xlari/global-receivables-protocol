"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, BadgeCheck, CircleDollarSign, History, MousePointer2 } from "lucide-react";
import styles from "@/app/grp.module.css";

const scenes = [
  {
    eyebrow: "01 · Obligation",
    title: "A future payment exists.",
    body: "A requester in Brazil registers a $2,000 receivable from a payer in the United States. Private evidence stays off-chain.",
    metric: "$2,000 · due in 30 days",
  },
  {
    eyebrow: "02 · Confirmation",
    title: "The payer makes it verifiable.",
    body: "The payer signs the obligation with the wallet that will settle it. GRP binds the confirmation to the receivable.",
    metric: "Payer confirmed ✓",
  },
  {
    eyebrow: "03 · Liquidity",
    title: "Capital can meet the receivable anywhere.",
    body: "Once validated, a USDC funding pool opens. Liquidity can come from investors across markets without changing the underlying obligation.",
    metric: "1,440 / 2,000 USDC funded",
  },
  {
    eyebrow: "04 · Settlement",
    title: "Value returns through one programmable rail.",
    body: "At maturity, the payer settles in USDC. GRP records the canonical financial state and distributes the repayment.",
    metric: "2,000 USDC settled",
  },
  {
    eyebrow: "05 · Passport",
    title: "History should not stop at a border.",
    body: "The settlement becomes portable financial history: on-time performance, late payments and cured defaults travel with the requester.",
    metric: "Receivable Passport updated",
  },
];

function Globe({ active, drag }: { active: number; drag: number }) {
  const shift = [-14, -5, 8, 16, 2][active] + drag;
  return (
    <div className={styles.globeWrap} aria-hidden="true">
      <div className={styles.globeGlow} />
      <svg className={styles.globe} viewBox="0 0 620 620" role="img">
        <defs>
          <clipPath id="grp-globe-clip"><circle cx="310" cy="310" r="242" /></clipPath>
          <radialGradient id="grp-globe-fill" cx="38%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#143a23" />
            <stop offset="58%" stopColor="#07140d" />
            <stop offset="100%" stopColor="#030805" />
          </radialGradient>
          <linearGradient id="grp-route-gradient" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#8cff98" />
            <stop offset="100%" stopColor="#f4fff6" />
          </linearGradient>
        </defs>

        <circle cx="310" cy="310" r="242" fill="url(#grp-globe-fill)" stroke="#70ff8c" strokeOpacity=".68" strokeWidth="2" />

        <g clipPath="url(#grp-globe-clip)" className={styles.globeGrid} style={{ transform: `translateX(${shift}px)` }}>
          {[145, 205, 265, 325, 385, 445, 505].map((x) => (
            <ellipse key={x} cx={x} cy="310" rx="66" ry="242" fill="none" stroke="#59e878" strokeOpacity=".26" strokeWidth="1.2" />
          ))}
          {[140, 195, 250, 310, 370, 425, 480].map((y) => (
            <ellipse key={y} cx="310" cy="310" rx="242" ry={Math.max(28, Math.abs(y - 310) * .42 + 36)} fill="none" stroke="#59e878" strokeOpacity=".22" strokeWidth="1" transform={`translate(0 ${y-310})`} />
          ))}

          <path d="M164 213l28-24 32 4 18-16 26 13 13 32-18 27-29 7-15 24-32-11-16-23-20-7z" className={styles.land} />
          <path d="M229 304l31 16 25 28-5 28 17 29-12 47-25 42-15-16 5-37-21-25-11-39 7-30-13-27z" className={styles.land} />
          <path d="M355 183l37-16 48 13 22 25 45 9 17 28-25 18-33-7-26 24-36-12-24 16-24-18-21-4-9-31z" className={styles.land} />
          <path d="M366 281l33 5 31 28-4 41-20 38-23 32-21-8-13-38-16-34 9-34z" className={styles.land} />
          <path d="M475 397l25-3 20 18-8 23-30 5-19-18z" className={styles.land} />
        </g>

        <g className={styles.routeLayer}>
          <circle className={styles.node} cx="250" cy="365" r="7" />
          <circle className={styles.node} cx="208" cy="236" r="7" />
          {active >= 1 && <path className={styles.route} d="M250 365 Q205 286 208 236" />}
          {active >= 2 && <path className={styles.routeSoft} d="M250 365 Q330 325 385 284" />}
          {active >= 2 && <path className={styles.routeSoft} d="M250 365 Q365 390 458 410" />}
          {active >= 2 && <path className={styles.routeSoft} d="M250 365 Q174 403 128 432" />}
          {active >= 3 && <path className={styles.routeReverse} d="M208 236 Q205 286 250 365" />}
          {active >= 4 && <circle className={styles.passportRing} cx="250" cy="365" r="25" />}
        </g>
      </svg>

      <div className={styles.globeLabel} data-active={active}>
        <span>{active === 0 ? "São Paulo" : active === 1 ? "New York" : active === 2 ? "Global liquidity" : active === 3 ? "USDC settled" : "Passport updated"}</span>
        <strong>{scenes[active].metric}</strong>
      </div>
    </div>
  );
}

export function GrpExperience() {
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState(0);
  const pointer = useRef<number | null>(null);
  const sceneRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const value = Number((visible.target as HTMLElement).dataset.scene);
        if (Number.isFinite(value)) setActive(value);
      },
      { threshold: [0.25, 0.5, 0.75], rootMargin: "-18% 0px -18% 0px" },
    );

    sceneRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.page}>
      <section className={styles.opening}>
        <div className={styles.openingNoise} />
        <div className={styles.openingTop}>
          <span>GLOBAL RECEIVABLES PROTOCOL</span>
          <span className={styles.live}><i /> LIVE · SOLANA DEVNET</span>
        </div>

        <div className={styles.openingCenter}>
          <p className={styles.openingOverline}>FUTURE PAYMENTS · GLOBAL LIQUIDITY</p>
          <h1>Money moves globally.<br />Receivables should too.</h1>
          <p>
            GRP turns verified future payments into programmable, financeable receivables
            settled in USDC on Solana.
          </p>
          <div className={styles.openingActions}>
            <Link href="/markets" className={styles.signalButton}>
              Explore markets <ArrowRight size={18} />
            </Link>
            <Link href="/como-funciona" className={styles.ghostButton}>Explore the protocol</Link>
          </div>
        </div>

        <div className={styles.openingHint}><ArrowDown size={15} /> scroll to move value</div>
      </section>

      <section id="world" className={styles.world}>
        <div className={styles.worldSticky}>
          <div className={styles.worldHeader}>
            <span>GRP / GLOBAL STATE</span>
            <span>DRAG THE GLOBE · SCROLL THE PROTOCOL</span>
          </div>
          <div
            className={styles.globeStage}
            onPointerDown={(event) => { pointer.current = event.clientX; }}
            onPointerMove={(event) => {
              if (pointer.current === null) return;
              const delta = event.clientX - pointer.current;
              setDrag((value) => Math.max(-36, Math.min(36, value + delta * .08)));
              pointer.current = event.clientX;
            }}
            onPointerUp={() => { pointer.current = null; }}
            onPointerLeave={() => { pointer.current = null; }}
          >
            <Globe active={active} drag={drag} />
            <div className={styles.dragHint}><MousePointer2 size={15} /> drag</div>
          </div>
          <div className={styles.sceneCounter}>0{active + 1} / 05</div>
        </div>

        <div className={styles.sceneRail}>
          {scenes.map((scene, index) => (
            <article
              key={scene.eyebrow}
              ref={(node) => { sceneRefs.current[index] = node; }}
              data-scene={index}
              className={styles.scene}
            >
              <div className={styles.sceneCopy}>
                <span>{scene.eyebrow}</span>
                <h2>{scene.title}</h2>
                <p>{scene.body}</p>
                <strong>{scene.metric}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.statement}>
        <div className={styles.statementGrid}>
          <span>ONE CANONICAL STATE</span>
          <h2>Private evidence off-chain.<br />Financial truth on Solana.</h2>
          <p>
            The protocol coordinates requester, payer, originator and investor without
            forcing sensitive documents onto a public ledger.
          </p>
        </div>
      </section>

      <section className={styles.passportScene}>
        <div className={styles.passportOrbit}>
          <div className={styles.passportCore}>
            <span>RECEIVABLE PASSPORT</span>
            <strong>48,200</strong>
            <small>USDC settled</small>
          </div>
          <div className={styles.passportChip} data-pos="one"><small>on-time rate</small><strong>91.7%</strong></div>
          <div className={styles.passportChip} data-pos="two"><small>settled</small><strong>12</strong></div>
          <div className={styles.passportChip} data-pos="three"><small>defaults cured</small><strong>1</strong></div>
        </div>
        <div className={styles.passportCopy}>
          <span>05 · PORTABLE HISTORY</span>
          <h2>Your financial history should not stop at a border.</h2>
          <p>Every receivable adds verifiable performance to a portable Passport.</p>
        </div>
      </section>

      <section className={styles.verticalScene}>
        <div className={styles.verticalSignal}>
          <span>BUILT ON GRP / FIRST VERTICAL</span>
          <strong>01</strong>
        </div>

        <div className={styles.verticalCopy}>
          <h2>One protocol.<br />Different markets.</h2>
          <p>
            Elas Recebem Hoje is the first application built on GRP — a Brazilian
            vertical focused on professionals receiving from global clients.
          </p>
          <div className={styles.marketActions}>
            <Link href="/markets" className={styles.verticalAction}>
              Explore markets <ArrowRight size={17} />
            </Link>
            <Link href="/build-on-grp" className={styles.verticalAction}>
              Build a market <ArrowRight size={17} />
            </Link>
          </div>
        </div>

        <div className={styles.verticalNode}>
          <div className={styles.verticalNodeTop}>
            <span>APPLICATION NODE</span>
            <span>BR · ACTIVE</span>
          </div>
          <div className={styles.verticalNodeBody}>
            <div className={styles.verticalNodeMark}>ERH</div>
            <div>
              <small>POWERED BY GRP</small>
              <h3>Elas Recebem Hoje</h3>
              <p>Brazilian receivables application</p>
            </div>
          </div>
          <div className={styles.verticalNodeState}>
            <span>market</span><strong>Brazil</strong>
            <span>settlement</span><strong>USDC</strong>
            <span>protocol</span><strong>GRP v1</strong>
          </div>
        </div>
      </section>

      <section className={styles.proof}>
        <div>
          <span className={styles.proofLive}><i /> LIVE PROTOCOL</span>
          <h2>Not a concept.<br />Deployed on Devnet.</h2>
        </div>
        <dl>
          <div><dt>Network</dt><dd>Solana Devnet</dd></div>
          <div><dt>Settlement asset</dt><dd>USDC</dd></div>
          <div><dt>Program status</dt><dd>Active</dd></div>
          <div><dt>Protocol version</dt><dd>v1</dd></div>
        </dl>
      </section>

      <section className={styles.close}>
        <span>GLOBAL RECEIVABLES PROTOCOL</span>
        <h2>Make future payments<br />move like money.</h2>
        <Link href="/markets" className={styles.signalButton}>
          Launch a market experience <ArrowRight size={18} />
        </Link>
        <div className={styles.closeMeta}>
          <span><BadgeCheck size={14} /> verifiable obligations</span>
          <span><CircleDollarSign size={14} /> USDC settlement</span>
          <span><History size={14} /> portable reputation</span>
        </div>
      </section>
    </div>
  );
}
