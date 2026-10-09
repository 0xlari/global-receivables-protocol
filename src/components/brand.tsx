import Link from "next/link";

function GrpMark() {
  return (
    <svg
      className="brand__grp-symbol"
      viewBox="0 0 104 34"
      role="img"
      aria-label="GRP"
    >
      <defs>
        <linearGradient id="grp-wordmark-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="72%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#39ff88" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke="url(#grp-wordmark-gradient)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M31 7H12C6 7 4 10.5 4 17s2 10 8 10h19v-9H21" />
        <path d="M40 27V7h16c5 0 7 2.2 7 6.2S61 19.4 56 19.4H40m12 0L64 27" />
        <path d="M73 27V7h16c5 0 7 2.2 7 6.2s-2 6.2-7 6.2H73" />
      </g>
    </svg>
  );
}

export function Brand({ variant = "grp" }: { variant?: "grp" | "erh" }) {
  const erh = variant === "erh";

  if (erh) {
    return (
      <Link
        className="brand brand--erh"
        href="/elas-recebem-hoje"
        aria-label="Elas Recebem Hoje — início"
      >
        <span className="brand__mark" aria-hidden="true">E</span>
        <span className="brand__name"><strong>Elas Recebem Hoje</strong></span>
      </Link>
    );
  }

  return (
    <Link
      className="brand brand--grp"
      href="/"
      aria-label="Global Receivables Protocol — home"
    >
      <GrpMark />
    </Link>
  );
}
