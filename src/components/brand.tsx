import Link from "next/link";

export function Brand({ variant = "grp" }: { variant?: "grp" | "erh" }) {
  const erh = variant === "erh";
  return (
    <Link
      className={`brand ${erh ? "brand--erh" : "brand--grp"}`}
      href={erh ? "/elas-recebem-hoje" : "/"}
      aria-label={erh ? "Elas Recebem Hoje — início" : "Global Receivables Protocol — home"}
    >
      <span className="brand__mark" aria-hidden="true">{erh ? "E" : "GRP"}</span>
      <span className="brand__name">
        <strong>{erh ? "Elas Recebem Hoje" : "Global Receivables Protocol"}</strong>
      </span>
    </Link>
  );
}
