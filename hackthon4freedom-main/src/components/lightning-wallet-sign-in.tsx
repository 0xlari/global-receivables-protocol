"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LoaderCircle, RefreshCw, WalletCards } from "lucide-react";
import Image from "next/image";

type Challenge = { challengeId: string; pollToken: string; lnurl: string; qrDataUrl: string; expiresAt: string; publicHttps: boolean };
type State = "idle" | "working" | "waiting" | "success" | "error";

type LightningWalletSignInProps = { redirectTo?: string };

export function LightningWalletSignIn({ redirectTo = "/painel" }: LightningWalletSignInProps) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [message, setMessage] = useState("Nenhum e-mail, senha ou pagamento é necessário.");

  async function createChallenge() {
    setState("working");
    setChallenge(null);
    setMessage("Criando um desafio seguro para sua carteira…");
    try {
      const response = await fetch("/api/auth/lnurl/challenge", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setChallenge(body);
      setState("waiting");
      setMessage("Confirme o login na carteira. Esta assinatura não movimenta sats.");
    } catch {
      setState("error");
      setMessage("Não foi possível criar o acesso. Confira o banco e tente novamente.");
    }
  }

  useEffect(() => {
    if (!challenge || state !== "waiting") return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/auth/lnurl/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId: challenge.challengeId, pollToken: challenge.pollToken }),
        });
        if (response.status === 202 || stopped) return;
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        stopped = true;
        window.clearInterval(timer);
        setState("success");
        setMessage("Carteira confirmada. Sua sessão privada foi criada.");
        router.replace(redirectTo);
        router.refresh();
      } catch (error) {
        if (stopped) return;
        stopped = true;
        window.clearInterval(timer);
        setState("error");
        setChallenge(null);
        setMessage(error instanceof Error && error.message ? error.message : "O QR expirou. Gere outro para continuar.");
      }
    }, 1_500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [challenge, redirectTo, router, state]);

  return (
    <div className="wallet-sign-in">
      {challenge && state === "waiting" ? (
        <div className="wallet-sign-in__challenge">
          {/* Gerado no servidor; nenhuma URL de autenticação é enviada a terceiros. */}
          <Image unoptimized src={challenge.qrDataUrl} alt="QR code para entrar com uma carteira Lightning" width={320} height={320} />
          <a className="wallet-sign-in__open" href={`lightning:${challenge.lnurl}`}><ExternalLink aria-hidden="true" size={18} /> Abrir na carteira</a>
          <button className="wallet-sign-in__secondary" type="button" onClick={createChallenge}><RefreshCw aria-hidden="true" size={17} /> Gerar outro QR</button>
          {!challenge.publicHttps && <small>Este QR usa localhost. Para confirmar pelo celular, publique o callback em HTTPS e configure LNURL_AUTH_BASE_URL.</small>}
        </div>
      ) : state === "success" ? null : (
        <button className="wallet-sign-in__button" type="button" onClick={createChallenge} disabled={state === "working"}>
          {state === "working" ? <LoaderCircle className="spin" aria-hidden="true" size={20} /> : <WalletCards aria-hidden="true" size={20} />}
          {state === "working" ? "Preparando carteira…" : "Conectar carteira Lightning"}
        </button>
      )}
      <p className={`wallet-sign-in__status wallet-sign-in__status--${state}`} role="status">{message}</p>
    </div>
  );
}
