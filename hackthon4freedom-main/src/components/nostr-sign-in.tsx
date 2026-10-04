"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Nip07Signer, type Nip07Window } from "@nostr/signer";
import type { ProtocolUnsignedEvent } from "@protocol/schemas";

type ProviderState = "checking" | "available" | "missing";

export function NostrSignIn({ redirectTo, forceSwitch = false }: { redirectTo: string; forceSwitch?: boolean }) {
  const [provider, setProvider] = useState<ProviderState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function detectProvider() {
    setProvider((window as unknown as Nip07Window).nostr ? "available" : "missing");
  }

  useEffect(() => {
    let active = true;
    const prepare = async () => {
      if (forceSwitch) {
        try {
          const response = await fetch("/api/auth/session", { method: "DELETE" });
          if (!response.ok) throw new Error();
        } catch {
          if (active) setError("Não foi possível encerrar o acesso anterior. Recarregue a página e tente novamente.");
        }
      } else {
        try {
          const response = await fetch("/api/auth/session", { cache: "no-store" });
          if (response.ok && active) {
            router.replace(redirectTo);
            router.refresh();
            return;
          }
        } catch {
          // A entrada continua disponível quando a consulta da sessão falha.
        }
      }
      if (active) detectProvider();
    };
    void prepare();
    return () => { active = false; };
  }, [forceSwitch, redirectTo, router]);

  async function signIn() {
    setBusy(true);
    setError("");
    let phase: "permission" | "signature" | "complete" = "permission";
    try {
      const signer = Nip07Signer.fromWindow(window as unknown as Nip07Window);
      const pubkey = await signer.getPublicKey();
      const challengeResponse = await fetch("/api/auth/nostr/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey }),
      });
      const challenge = await challengeResponse.json() as { challengeId?: string; event?: ProtocolUnsignedEvent; error?: string };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.event) throw new Error(challenge.error ?? "ACCESS_REQUEST_FAILED");
      phase = "signature";
      const event = await signer.signEvent(challenge.event);
      if (event.pubkey !== pubkey) throw new Error("PUBKEY_MISMATCH");
      phase = "complete";
      const completeResponse = await fetch("/api/auth/nostr/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, event }),
      });
      const complete = await completeResponse.json() as { error?: string };
      if (!completeResponse.ok) throw new Error(complete.error ?? "ACCESS_FAILED");
      router.replace(redirectTo);
      router.refresh();
    } catch (cause) {
      if (!(window as unknown as Nip07Window).nostr) {
        setProvider("missing");
        setError("Não encontramos um assinador Nostr neste navegador.");
      } else if (cause instanceof Error && cause.message === "PUBKEY_MISMATCH") {
        setError("A identidade usada não corresponde à solicitação atual.");
      } else if (phase === "permission") {
        setError("A autorização foi cancelada no seu assinador.");
      } else if (phase === "signature") {
        setError("A assinatura não foi autorizada.");
      } else {
        setError(cause instanceof Error && !/^[A-Z0-9_]+$/.test(cause.message)
          ? cause.message
          : "Não foi possível concluir o acesso agora.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (provider === "checking") return <p role="status">Verificando sua identidade…</p>;
  if (provider === "missing") return <div className="wallet-sign-in">
    <h2>Conecte uma identidade Nostr</h2>
    <p>Para entrar, ative um assinador Nostr compatível no navegador. Sua chave privada permanece no assinador e nunca é enviada à plataforma.</p>
    <p>Instale ou ative um assinador Nostr no navegador e volte a esta tela.</p>
    {error ? <p className="wallet-sign-in__status wallet-sign-in__status--error" role="alert">{error}</p> : null}
    <div className="demo-actions">
      <button className="button button--primary" type="button" onClick={detectProvider}>Tentar novamente</button>
      <Link className="button button--secondary" href="/">Voltar à página inicial</Link>
    </div>
  </div>;

  return <div className="wallet-sign-in">
    {error ? <p className="wallet-sign-in__status wallet-sign-in__status--error" role="alert">{error}</p> : null}
    <button className="button button--primary" type="button" disabled={busy} onClick={() => void signIn()}>
      {busy ? "Aguardando autorização…" : "Entrar com Nostr"}
    </button>
  </div>;
}
