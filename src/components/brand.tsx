import Link from "next/link";

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
      <img
        className="brand__grp-image"
        src="/grp-logo.svg"
        alt=""
        width="216"
        height="72"
      />
    </Link>
  );
}
