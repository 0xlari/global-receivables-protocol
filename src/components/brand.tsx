import Link from "next/link";

function GrpWordmark() {
  return (
    <img
      className="brand__grp-wordmark"
      src="/Logo_GRP.png"
      alt="GRP"
      width={200}
      height={100}
    />
  );
}

export function Brand({
  variant = "grp",
}: {
  variant?: "grp" | "erh";
}) {
  if (variant === "erh") {
    return (
      <Link
        className="brand brand--erh"
        href="/elas-recebem-hoje"
        aria-label="Elas Recebem Hoje — início"
      >
        <span className="brand__mark" aria-hidden="true">E</span>
        <span className="brand__name">
          <strong>Elas Recebem Hoje</strong>
        </span>
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