"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, WalletCards } from "lucide-react";
import { PublicKey } from "@solana/web3.js";

import {
  buildInitializeProtocolTransaction,
  getGrpProtocolStatus,
  GRP_PROGRAM_ID,
  GRP_RPC_URL,
  type BrowserSolanaProvider,
} from "@/lib/grp-solana";

type SessionProfile = {
  id: string;
  solanaWallet?: string | null;
};

type ProtocolState = {
  initialized: boolean;
  authority?: string;
  treasury?: string;
  usdcMint?: string;
  protocolVersion?: number;
  paused?: boolean;
};

const configuredAuthority = process.env.NEXT_PUBLIC_GRP_ORIGINATOR_WALLET ?? "";
const configuredUsdcMint = process.env.NEXT_PUBLIC_GRP_USDC_MINT ?? "";

function browserWallet() {
  return (window as Window & { solana?: BrowserSolanaProvider }).solana;
}

function short(value: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-6)}` : "não configurado";
}

export function GrpProtocolSetup() {
  const [profile, setProfile] = useState<SessionProfile>();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [protocol, setProtocol] = useState<ProtocolState>({ initialized: false });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");

  async function refreshProtocol() {
    const status = await getGrpProtocolStatus();
    if (!status.initialized) {
      setProtocol({ initialized: false });
      return;
    }
    setProtocol({
      initialized: true,
      authority: status.authority.toBase58(),
      treasury: status.treasury.toBase58(),
      usdcMint: status.usdcMint.toBase58(),
      protocolVersion: status.protocolVersion,
      paused: status.paused,
    });
  }

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          setAuthenticated(false);
          return;
        }
        const body = await response.json() as { profile?: SessionProfile };
        if (!body.profile?.id) {
          setAuthenticated(false);
          return;
        }
        setProfile(body.profile);
        setAuthenticated(true);
        await refreshProtocol();
      } catch {
        setMessage("Não foi possível ler o estado do GRP na Devnet.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function initialize() {
    setWorking(true);
    setMessage("");
    setSignature("");

    try {
      if (!configuredAuthority || !configuredUsdcMint) {
        throw new Error("Configure a authority e o mint USDC do GRP no ambiente.");
      }
      if (!profile?.solanaWallet) {
        throw new Error("Entre novamente usando sua carteira Solana.");
      }
      if (profile.solanaWallet !== configuredAuthority) {
        throw new Error("A sessão atual não pertence à authority configurada do GRP.");
      }

      const provider = browserWallet();
      if (!provider?.connect || !provider.signAndSendTransaction) {
        throw new Error("Nenhuma carteira Solana compatível foi encontrada neste navegador.");
      }

      const connected = await provider.connect();
      const authority = new PublicKey(connected.publicKey.toBase58());
      if (authority.toBase58() !== configuredAuthority) {
        throw new Error("Conecte a carteira authority configurada para o GRP.");
      }

      const built = await buildInitializeProtocolTransaction({
        authority,
        treasury: authority,
        usdcMint: new PublicKey(configuredUsdcMint),
      });

      const sent = await provider.signAndSendTransaction(built.transaction);
      await built.connection.confirmTransaction({
        signature: sent.signature,
        blockhash: built.blockhash,
        lastValidBlockHeight: built.lastValidBlockHeight,
      }, "confirmed");

      setSignature(sent.signature);
      setMessage("ProtocolConfig inicializado na Solana Devnet.");
      await refreshProtocol();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Não foi possível inicializar o GRP.";
      setMessage(
        text === "GRP_PROTOCOL_ALREADY_INITIALIZED"
          ? "O ProtocolConfig já está inicializado."
          : text,
      );
      await refreshProtocol().catch(() => undefined);
    } finally {
      setWorking(false);
    }
  }

  if (loading || authenticated === null) {
    return <div className="dashboard-loading">Lendo o estado do GRP na Devnet…</div>;
  }

  if (!authenticated) {
    return (
      <div className="demo-callout">
        <strong>Entre com a carteira authority para continuar.</strong>
        <a className="button button--primary" href="/entrar?next=/administracao/grp">
          Entrar com carteira Solana
        </a>
      </div>
    );
  }

  const authorizedSession = profile?.solanaWallet === configuredAuthority;

  return (
    <section className="confirmation-form">
      <span className="kicker">GRP Devnet</span>
      <h2>Configuração do protocolo</h2>
      <p>
        Esta etapa é executada uma única vez. Ela cria o ProtocolConfig usado pelas
        transações do GRP.
      </p>

      <dl className="authorization-review">
        <div><dt>Rede</dt><dd>Solana Devnet</dd></div>
        <div><dt>RPC</dt><dd>{GRP_RPC_URL}</dd></div>
        <div><dt>Program ID</dt><dd><code>{short(GRP_PROGRAM_ID.toBase58())}</code></dd></div>
        <div><dt>Authority</dt><dd><code>{short(configuredAuthority)}</code></dd></div>
        <div><dt>USDC mint</dt><dd><code>{short(configuredUsdcMint)}</code></dd></div>
      </dl>

      {protocol.initialized ? (
        <>
          <div className="confirmation-form__security">
            <CheckCircle2 />
            ProtocolConfig inicializado e disponível na Devnet.
          </div>
          <dl className="authorization-review">
            <div><dt>Authority on-chain</dt><dd><code>{short(protocol.authority ?? "")}</code></dd></div>
            <div><dt>Treasury on-chain</dt><dd><code>{short(protocol.treasury ?? "")}</code></dd></div>
            <div><dt>USDC on-chain</dt><dd><code>{short(protocol.usdcMint ?? "")}</code></dd></div>
            <div><dt>Versão</dt><dd>{protocol.protocolVersion}</dd></div>
            <div><dt>Status</dt><dd>{protocol.paused ? "Pausado" : "Ativo"}</dd></div>
          </dl>
        </>
      ) : (
        <>
          <div className="confirmation-form__security">
            <CircleAlert />
            O programa está deployado, mas o ProtocolConfig ainda não existe.
          </div>
          {!authorizedSession ? (
            <p className="form-error">
              A sessão atual não usa a carteira authority configurada.
            </p>
          ) : null}
          <button
            className="button button--primary"
            type="button"
            disabled={working || !authorizedSession || !configuredUsdcMint}
            onClick={() => void initialize()}
          >
            {working ? <LoaderCircle className="spin" size={19} /> : <WalletCards size={19} />}
            {working ? "Aguardando assinatura…" : "Inicializar protocolo"}
          </button>
        </>
      )}

      {message ? <p role="status">{message}</p> : null}
      {signature ? (
        <small>Transação: {signature.slice(0, 12)}…{signature.slice(-8)}</small>
      ) : null}
    </section>
  );
}
