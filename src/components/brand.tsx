import Link from "next/link";

function GrpMark() {
  return (
    <svg
      className="brand__grp-symbol"
      viewBox="0 0 100 34"
      role="img"
      aria-label="GRP"
    >
      <defs>
        <linearGradient id="grp-brand-gradient" x1="0" x2="1">
          <stop offset="0%" stopColor="#f5f7f3" />
          <stop offset="55%" stopColor="#f5f7f3" />
          <stop offset="100%" stopColor="#39ff88" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke="url(#grp-brand-gradient)"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M29 7H11C6 7 4 10 4 17s2 10 7 10h18v-9H20" />
        <path d="M38 27V7h16c5 0 7 2 7 6s-2 6-7 6H38m13 0 11 8" />
        <path d="M71 27V7h16c5 0 7 2 7 6s-2 6-7 6H71" />
      </g>
      <circle cx="29" cy="18" r="2.4" fill="#39ff88" />
      <circle cx="94" cy="13" r="2.4" fill="#39ff88" />
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
      <span className="brand__mark brand__mark--grp" aria-hidden="true">
        <GrpMark />
      </span>
      <span className="brand__name brand__name--grp">
        <strong>Global Receivables Protocol</strong>
      </span>
    </Link>
  );
}
