import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Global Receivables Protocol — home">
      <span className="brand__mark" aria-hidden="true">G</span>
      <span className="brand__name">
        <strong>Global Receivables Protocol</strong>
      </span>
    </Link>
  );
}
