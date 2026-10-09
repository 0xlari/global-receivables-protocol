"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SessionState = {
  status: "loading" | "anonymous" | "authenticated";
  label?: string;
};

export function ErhSessionAwareNavigation({ mobile = false }: { mobile?: boolean }) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setSession({ status: "anonymous" });
          return;
        }
        const body = await response.json() as { profile?: { label: string } };
        setSession({
          status: "authenticated",
          label: body.profile?.label ?? "Carteira conectada",
        });
      })
      .catch(() => {
        if (active) setSession({ status: "anonymous" });
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    setSession({ status: "anonymous" });
    router.replace("/elas-recebem-hoje");
    router.refresh();
  }

  return (
    <>
      <Link href="/elas-recebem-hoje">Início</Link>
      <Link href="/elas-recebem-hoje#como-funciona">Como funciona</Link>
      <Link href="/elas-recebem-hoje/recebivel">Criar recebível</Link>
      <Link href="/elas-recebem-hoje/oportunidades">Oportunidades</Link>
      {session.status === "authenticated" ? (
        <>
          <Link href="/elas-recebem-hoje/painel">Meu painel</Link>
          <Link href="/elas-recebem-hoje/passaporte">Meu Passport</Link>
          <Link href="/elas-recebem-hoje/carteira">Minha carteira</Link>
          <Link
            href="/elas-recebem-hoje/entrar?trocar=1&next=/elas-recebem-hoje/painel"
            title={session.label}
          >
            Trocar carteira
          </Link>
          <button
            className={mobile ? "mobile-nav__action" : "nav-action"}
            type="button"
            onClick={signOut}
          >
            Sair
          </button>
        </>
      ) : (
        <Link
          className={mobile ? undefined : "button button--quiet"}
          href="/elas-recebem-hoje/entrar"
        >
          Entrar
        </Link>
      )}
    </>
  );
}
