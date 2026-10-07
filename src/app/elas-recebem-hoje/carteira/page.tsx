import type { Metadata } from "next";
import { ErhWalletPage } from "@/components/erh-wallet-page";

export const metadata: Metadata = { title: "Carteira | Elas Recebem Hoje" };

export default function Page() {
  return <div className="inner-page"><div className="shell"><ErhWalletPage /></div></div>;
}
