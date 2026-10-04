import { ProtocolPublicPool } from "@/components/protocol-public-pool";

export default async function ProtocolPoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="inner-page"><section className="page-hero page-hero--compact"><div className="shell page-hero__inner"><span className="eyebrow">Pool pública BTC</span><h1>Estado verificável, não uma promessa.</h1><p>Eventos assinados são lidos dos relays e reduzidos localmente.</p></div></section><section className="section"><div className="shell form-shell"><ProtocolPublicPool poolEventId={id} /></div></section></main>;
}
