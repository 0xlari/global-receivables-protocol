import Link from "next/link";

function GrpWordmark() {
  return (
    <svg
      className="brand__grp-wordmark"
      viewBox="0 0 132 40"
      role="img"
      aria-label="GRP"
    >
      <defs>
        <linearGradient id="grp-wordmark-stroke" x1="0" y1="0" x2="132" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="72%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#39ff88" />
        </linearGradient>
      </defs>

      <g
        fill="none"
        stroke="url(#grp-wordmark-stroke)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* G */}
        <path d="M36 8H17C9 8 5 12.5 5 20s4 12 12 12h20V21H26" />

        {/* R */}
        <path d="M48 32V8h19c7 0 10 3.3 10 8s-3 8-10 8H48" />
        <path d="M64 24L79 32" />

        {/* P */}
        <path d="M91 32V8h20c7 0 10 3.3 10 8s-3 8-10 8H91" />
      </g>

      <circle cx="36" cy="21" r="2.8" fill="#39ff88" />
      <circle cx="121" cy="16" r="2.8" fill="#39ff88" />
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
      <GrpWordmark />
    </Link>
  );
}
