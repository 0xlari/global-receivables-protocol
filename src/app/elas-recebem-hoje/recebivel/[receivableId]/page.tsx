import type { Metadata } from "next";
import { ErhReceivableDetail } from "@/components/erh-receivable-detail";

export const metadata: Metadata = { title: "Recebível | Elas Recebem Hoje" };

export default async function Page({ params }: { params: Promise<{ receivableId: string }> }) {
  const { receivableId } = await params;
  return <div className="inner-page"><div className="shell"><ErhReceivableDetail receivableId={receivableId} /></div></div>;
}
