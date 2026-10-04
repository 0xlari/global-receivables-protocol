import { ProtocolOriginatorFlow } from "@/components/protocol-originator-flow";

export default async function ProtocolOriginatorPage({ searchParams }: { searchParams: Promise<{ receivable?: string }> }) {
  const { receivable } = await searchParams;
  if (!receivable || !/^[a-f0-9]{64}$/.test(receivable)) return <main className="section"><div className="shell"><h1>Link de recebível inválido.</h1></div></main>;
  return <main className="inner-page"><section className="page-hero page-hero--compact"><div className="shell page-hero__inner"><span className="eyebrow">Cliente originador</span><h1>Confirme e autorize com transparência.</h1><p>Você valida por seus próprios critérios. A conexão NWC permanece privada e criptografada.</p></div></section><section className="section"><div className="shell form-shell"><ProtocolOriginatorFlow receivableEventId={receivable} /></div></section></main>;
}
