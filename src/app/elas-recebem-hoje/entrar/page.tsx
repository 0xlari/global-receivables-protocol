import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";

import { SolanaWalletSignIn } from "@/components/solana-wallet-sign-in";

export const metadata: Metadata = {
  title: "Entrar | Elas Recebem Hoje",
  description: "Acesso ao Elas Recebem Hoje com carteira Solana.",
};

function safeRedirect(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/elas-recebem-hoje/painel";
}

export default async function ErhSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.next);

  return (
    <div className="inner-page auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <span className="auth-card__icon">
          <Fingerprint aria-hidden="true" />
        </span>
        <span className="kicker">Elas Recebem Hoje</span>
        <h1 id="auth-title">Entre com sua carteira Solana</h1>
        <p>
          Sua carteira identifica sua conta no Elas Recebem Hoje. A assinatura de login
          não movimenta SOL nem USDC.
        </p>
        <SolanaWalletSignIn redirectTo={redirectTo} />
      </section>
    </div>
  );
}
