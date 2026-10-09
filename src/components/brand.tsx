import Link from "next/link";

function GrpMark() {
  return (
    <svg
      className="brand__grp-symbol"
      viewBox="0 0 126 36"
      role="img"
      aria-label="GRP"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M35 7H14C7.5 7 4 10.4 4 18s3.5 11 10 11h21V19H23" />
        <path d="M45 29V7h21c6 0 9 2.4 9 6.4s-3 6.4-9 6.4H45m16 0 15 9.2" />
        <path d="M86 29V7h22c6 0 9 2.4 9 6.4s-3 6.4-9 6.4H86" />
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
