import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";

import { SolanaWalletSignIn } from "@/components/solana-wallet-sign-in";

export const metadata: Metadata = {
  title: "Sign in | GRP",
  description: "Private GRP access with a Solana wallet.",
};

function safeRedirect(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/administracao/grp";
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
        <span className="kicker">GRP protocol access</span>
        <h1 id="auth-title">Sign in with a Solana wallet</h1>
        <p>
          This access is for GRP protocol and administrative surfaces. End users should
          enter through a Market application such as Elas Recebem Hoje.
        </p>
        <SolanaWalletSignIn redirectTo={redirectTo} />
      </section>
    </div>
  );
}
