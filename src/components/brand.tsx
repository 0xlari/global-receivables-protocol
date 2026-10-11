import Link from "next/link";

function GrpMark() {
  return (
    <svg
      className="brand__grp-symbol"
      viewBox="0 0 106 33"
      role="img"
      aria-label="GRP"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M102 3L98 1 75 0 75 1 77 1 78 2 91 2 97 6 98 10 96 13 93 15 79 15 74 18 74 32 78 32 80 30 80 21 83 17 85 17 86 16 97 16 102 14 104 12 105 8ZM68 32 56 16 57 15 59 16 60 15 64 15 68 12 68 6 66 3 63 1 55 1 54 0 52 1 42 1 41 0 40 1 42 1 43 2 55 2 57 3 62 9 61 12 56 16 55 15 24 15 22 16 20 18 20 24 25 29 35 29 38 26 38 22 28 22 28 19 43 19 55 32 62 32 50 18 48 17 46 17 43 18 41 19 41 26 38 30 35 32 20 32 13 28 9 22 9 14 12 8 18 3 30 3 35 5 38 9 39 10 43 6 39 3 34 1 19 1 12 4 7 8 4 14 4 20 8 27 13 31 20 33 37 33 42 30 46 24 46 18 50 17 57 17 68 32Z"
      />
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
