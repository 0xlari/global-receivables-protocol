import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";

import { SolanaWalletSignIn } from "@/components/solana-wallet-sign-in";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesso privado com carteira Solana.",
};

function safeRedirect(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/painel";
}

export default async function SignInPage({
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
        <span className="kicker">Acesso ao GRP</span>
        <h1 id="auth-title">Entre com sua carteira Solana</h1>
        <p>
          Sua carteira identifica sua conta no Global Receivables Protocol.
          A assinatura de login não movimenta SOL nem USDC.
        </p>
        <SolanaWalletSignIn redirectTo={redirectTo} />
      </section>
    </div>
  );
}
