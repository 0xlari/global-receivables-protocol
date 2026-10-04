"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LightningWalletSignIn } from "@/components/lightning-wallet-sign-in";

export function WalletAccess({ redirectTo, forceSwitch = false }: { redirectTo: string; forceSwitch?: boolean }) {
  const [checking, setChecking] = useState(true);
  const [switchError, setSwitchError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const request = forceSwitch
      ? fetch("/api/auth/session", { method: "DELETE" }).then((response) => {
        if (!response.ok) throw new Error("SESSION_REVOCATION_FAILED");
        return new Response(null, { status: 401 });
      })
      : fetch("/api/auth/session", { cache: "no-store" });
    request
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          router.replace(redirectTo);
          router.refresh();
        } else setChecking(false);
      })
      .catch(() => {
        if (!active) return;
        setChecking(false);
        if (forceSwitch) setSwitchError(true);
      });
    return () => { active = false; };
  }, [forceSwitch, redirectTo, router]);

  if (checking) return <p className="wallet-sign-in__status" role="status">Verificando sua carteira…</p>;
  if (switchError) return <p className="wallet-sign-in__status wallet-sign-in__status--error" role="alert">Não foi possível encerrar a carteira anterior. Recarregue a página e tente novamente.</p>;
  return <LightningWalletSignIn redirectTo={redirectTo} />;
}
