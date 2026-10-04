import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Elas Recebem Hoje — início">
      <span className="brand__mark" aria-hidden="true">
        E
      </span>
      <span className="brand__name">
        Elas <strong>Recebem Hoje</strong>
      </span>
    </Link>
  );
}
