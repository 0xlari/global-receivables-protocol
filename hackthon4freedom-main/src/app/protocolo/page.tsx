import type { Metadata } from "next";

import { ProtocolReceivableFlow } from "@/components/protocol-receivable-flow";

export const metadata: Metadata = { title: "Lightning Receivables Protocol", description: "Experimente a LRP v0.1 sem movimentar fundos." };

export default async function ProtocolPage({ searchParams }: { searchParams: Promise<{ receivable?: string }> }) {
  const { receivable } = await searchParams;
  return <div className="inner-page"><section className="page-hero page-hero--compact"><div className="shell page-hero__inner"><span className="eyebrow">Lightning Receivables Protocol · LRP v0.1</span><h1>Recebível público e verificável.</h1><p>Assine com sua identidade Nostr e publique em três relays. Dados privados não saem do navegador.</p></div></section><section className="section"><div className="shell form-shell"><ProtocolReceivableFlow initialReceivableEventId={receivable} /></div></section></div>;
}
