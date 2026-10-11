import Link from "next/link";

function GrpWordmark() {
  return (
    <svg className="brand__grp-wordmark" viewBox="0 0 450 126" role="img" aria-label="GRP">
      <defs>
        <linearGradient id="grp-g-fill" x1="50" y1="0" x2="140" y2="126" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5f7f3" /><stop offset=".45" stopColor="#d7f8dd" /><stop offset=".72" stopColor="#39ff88" /><stop offset="1" stopColor="#f5f7f3" />
        </linearGradient>
        <linearGradient id="grp-r-fill" x1="200" y1="0" x2="285" y2="115" gradientUnits="userSpaceOnUse">
          <stop stopColor="#39ff88" /><stop offset=".45" stopColor="#e9f9ea" /><stop offset="1" stopColor="#39ff88" />
        </linearGradient>
        <linearGradient id="grp-p-fill" x1="350" y1="0" x2="435" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5f7f3" /><stop offset=".48" stopColor="#dff8df" /><stop offset="1" stopColor="#39ff88" />
        </linearGradient>
      </defs>
      {/* Filled silhouettes preserve the selected angular, interlocking wordmark. */}
      <path fill="url(#grp-g-fill)" d="M164 0H53Q42 0 34 8L8 34Q0 42 0 56V68Q0 82 9 91L35 117Q43 125 56 125H166V89Q166 77 157 68L139 50H96Q86 50 86 60V62Q86 71 96 71H124Q135 71 142 78L146 82V103H57Q51 103 47 99L22 75Q17 70 17 62Q17 56 23 50L51 22Q54 19 61 19H164Z" />
      <path fill="url(#grp-r-fill)" d="M192 0H280Q292 0 300 8Q312 20 312 34Q312 49 301 59Q293 69 277 69H236L216 50H276Q282 50 286 45Q291 40 291 34Q291 27 287 23Q284 19 277 19H211Z" />
      <path fill="#f5f7f3" d="M171 50H215L304 125H265L204 71H192Z" />
      <path fill="url(#grp-p-fill)" d="M323 0H414Q426 0 435 9Q447 20 447 35Q447 49 437 59Q428 69 413 69H371Q360 69 351 78L341 88V115Q341 125 331 125H323V85Q323 75 331 67L342 56Q348 50 359 50H413Q419 50 423 46Q428 41 428 35Q428 28 423 23Q419 19 413 19H323Z" />
      <rect x="86" y="50" width="20" height="21" rx="6" fill="#39ff88" />
      <rect x="323" y="104" width="19" height="21" rx="6" fill="#39ff88" />
    </svg>
  );
}

export function Brand({ variant = "grp" }: { variant?: "grp" | "erh" }) {
  if (variant === "erh") {
    return (
      <Link className="brand brand--erh" href="/elas-recebem-hoje" aria-label="Elas Recebem Hoje — início">
        <span className="brand__mark" aria-hidden="true">E</span>
        <span className="brand__name"><strong>Elas Recebem Hoje</strong></span>
      </Link>
    );
  }
  return (
    <Link className="brand brand--grp" href="/" aria-label="Global Receivables Protocol — home">
      <GrpWordmark />
    </Link>
  );
}
