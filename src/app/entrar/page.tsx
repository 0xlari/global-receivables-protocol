import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";

import { NostrSignIn } from "@/components/nostr-sign-in";

export const metadata: Metadata = { title: "Entrar", description: "Acesso privado com identidade Nostr." };

function safeRedirect(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/painel";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; trocar?: string | string[] }> }) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.next);
  const forceSwitch = (Array.isArray(params.trocar) ? params.trocar[0] : params.trocar) === "1";
  return <div className="inner-page auth-page"><section className="auth-card" aria-labelledby="auth-title">
    <span className="auth-card__icon"><Fingerprint aria-hidden="true" /></span>
    <span className="kicker">Acesso à plataforma</span>
    <h1 id="auth-title">Entre com sua identidade Nostr</h1>
    <p>Use sua identidade Nostr para acessar a plataforma e autorizar as informações públicas dos seus recebíveis.</p>
    <NostrSignIn redirectTo={redirectTo} forceSwitch={forceSwitch} />
  </section></div>;
}
