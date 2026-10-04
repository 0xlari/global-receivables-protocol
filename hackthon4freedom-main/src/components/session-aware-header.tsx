"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SessionState = { status: "loading" | "anonymous" | "authenticated"; label?: string };

export function SessionAwareNavigation({ mobile = false }: { mobile?: boolean }) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) return setSession({ status: "anonymous" });
        const body = await response.json() as { profile?: { label: string } };
        setSession({ status: "authenticated", label: body.profile?.label ?? "Perfil conectado" });
      })
      .catch(() => {
        if (active) setSession({ status: "anonymous" });
      });
    return () => { active = false; };
  }, [pathname]);

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    setSession({ status: "anonymous" });
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <Link href="/como-funciona">Como funciona</Link>
      <Link href="/pools">Pools</Link>
      {session.status === "authenticated" ? (
        <>
          <Link href="/painel">Painel</Link>
          <Link href="/entrar?trocar=1&next=/painel" title={session.label}>Trocar identidade</Link>
          <button className={mobile ? "mobile-nav__action" : "nav-action"} type="button" onClick={signOut}>Sair</button>
        </>
      ) : (
        <Link className={mobile ? undefined : "button button--quiet"} href="/entrar">Entrar</Link>
      )}
    </>
  );
}
