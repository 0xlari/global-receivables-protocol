import Link from "next/link";
import { ArrowUpRight, Bitcoin, MessageCircle } from "lucide-react";

import type { PublicPool } from "@/data/public-pools";

type PoolCardProps = { pool: PublicPool };

export function PoolCard({ pool }: PoolCardProps) {
  const { id, title, amount, funded, due, coverage } = pool;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const poolUrl = `${siteUrl}/pools/${id}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Ajude esta pool BTC a fechar. Veja prazo, riscos e cobertura: ${poolUrl}`)}`;

  return (
    <article className="pool-card">
      <div className="pool-card__topline">
        <span className="tag tag--soft">
          <Bitcoin aria-hidden="true" size={15} />
          Pool BTC
        </span>
        <ArrowUpRight aria-hidden="true" size={20} />
      </div>
      <h3>{title}</h3>
      <div className="pool-card__amount">{amount}</div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={funded}
        aria-label={`${funded}% financiado`}
      >
        <span style={{ width: `${funded}%` }} />
      </div>
      <div className="pool-card__meta">
        <span>{funded}% financiado</span>
        <span>Vence {due}</span>
      </div>
      <div className="pool-card__coverage"><span>Cobertura do principal</span><strong>{coverage}%</strong></div>
      <div className="pool-card__actions">
        <Link className="button button--secondary" href={`/pools/${id}`}>Ver detalhes <ArrowUpRight aria-hidden="true" size={17} /></Link>
        <a className="share-link" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" size={17} /> WhatsApp</a>
      </div>
    </article>
  );
}
