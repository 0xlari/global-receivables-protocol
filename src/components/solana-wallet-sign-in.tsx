"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, WalletCards } from "lucide-react";

type SolanaProvider = {
  isConnected?: boolean;
  publicKey?: { toBase58(): string };
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  signMessage(message: Uint8Array, display?: "utf8"): Promise<{ signature: Uint8Array }>;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function SolanaWalletSignIn({ redirectTo = "/painel" }: { redirectTo?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState(
    "A assinatura confirma o controle da carteira e não movimenta fundos.",
  );

  async function signIn() {
    setState("working");
    setMessage("Conectando sua carteira Solana…");

    try {
      const provider = window.solana;
      if (!provider?.connect || !provider.signMessage) {
        throw new Error("Nenhuma carteira Solana compatível foi encontrada neste navegador.");
      }

      const connection = await provider.connect();
      const wallet = connection.publicKey.toBase58();

      const challengeResponse = await fetch("/api/auth/solana/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      const challenge = await challengeResponse.json() as {
        challengeId?: string;
        message?: string;
        error?: string;
      };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message) {
        throw new Error(challenge.error ?? "Não foi possível iniciar o acesso.");
      }

      setMessage("Confirme a assinatura na sua carteira. Nenhum USDC será movimentado.");
      const signed = await provider.signMessage(
        new TextEncoder().encode(challenge.message),
        "utf8",
      );

      const completeResponse = await fetch("/api/auth/solana/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          wallet,
          signatureBase64: toBase64(signed.signature),
        }),
      });
      const complete = await completeResponse.json() as { authenticated?: boolean; error?: string };
      if (!completeResponse.ok || !complete.authenticated) {
        throw new Error(complete.error ?? "A assinatura não pôde ser validada.");
      }

      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível conectar a carteira.");
      return;
    }

    setState("idle");
  }

  return (
    <div className="wallet-sign-in">
      <button
        className="wallet-sign-in__button"
        type="button"
        onClick={() => void signIn()}
        disabled={state === "working"}
      >
        {state === "working" ? (
          <LoaderCircle className="spin" aria-hidden="true" size={20} />
        ) : (
          <WalletCards aria-hidden="true" size={20} />
        )}
        {state === "working" ? "Aguardando assinatura…" : "Conectar carteira Solana"}
      </button>
      <p className={`wallet-sign-in__status wallet-sign-in__status--${state}`} role="status">
        {message}
      </p>
      <small>Compatível inicialmente com carteiras injetadas no navegador, como Phantom.</small>
    </div>
  );
}
