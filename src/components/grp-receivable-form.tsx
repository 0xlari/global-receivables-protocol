"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Copy, ExternalLink, FileCheck2, WalletCards } from "lucide-react";
import { PublicKey } from "@solana/web3.js";

import {
  buildCreateReceivableTransaction,
  hexToBytes,
  type BrowserSolanaProvider,
} from "@/lib/grp-solana";

type SessionProfile = {
  id: string;
  solanaWallet?: string | null;
};

type CreatedReceivable = {
  receivableId: string;
  confirmationUrl: string;
  requesterSolanaWallet: string;
  evidenceHash: string;
  nominalUsdCents: string;
  dueAt: string;
  originatorWallet: string;
};

const minDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const maxDate = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

function browserWallet() {
  return (window as Window & { solana?: BrowserSolanaProvider }).solana;
}

async function evidenceCommitment(file: File) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const source = new Uint8Array(await file.arrayBuffer());
  const bytes = new Uint8Array(salt.length + source.length);
  bytes.set(salt);
  bytes.set(source, salt.length);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function evidenceMetadata(file: File, sha256: string) {
  const extension = file.name.toLowerCase().match(/\.(pdf|png|jpe?g)$/)?.[0];
  if (!extension) throw new Error("Envie um arquivo PDF, PNG, JPG ou JPEG.");
  const declaredMimeType =
    extension === ".pdf" ? "application/pdf" :
    extension === ".png" ? "image/png" :
    "image/jpeg";
  return {
    sha256,
    extension,
    declaredMimeType,
    byteSize: file.size,
  };
}

export function GrpReceivableForm({
  loginHref = "/entrar?next=/recebivel",
  dashboardHref = "/painel",
  experience = "GRP",
}: {
  loginHref?: string;
  dashboardHref?: string;
  experience?: "GRP" | "ERH";
} = {}) {
  const [profile, setProfile] = useState<SessionProfile>();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [created, setCreated] = useState<CreatedReceivable>();
  const [onChainSignature, setOnChainSignature] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
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
      })
      .catch(() => setAuthenticated(false));
  }, []);

  async function registerOnChain(result: CreatedReceivable) {
    const provider = browserWallet();
    if (!provider?.connect || !provider.signAndSendTransaction) {
      throw new Error("Nenhuma carteira Solana compatível foi encontrada neste navegador.");
    }

    const connected = await provider.connect();
    const requester = new PublicKey(connected.publicKey.toBase58());

    if (requester.toBase58() !== result.requesterSolanaWallet) {
      throw new Error("Conecte a mesma carteira Solana usada para entrar na plataforma.");
    }

    const originator = new PublicKey(result.originatorWallet);
    const built = await buildCreateReceivableTransaction({
      requester,
      receivableId: result.receivableId,
      originator,
      evidenceCommitment: hexToBytes(result.evidenceHash),
      nominalAmountMinor: BigInt(result.nominalUsdCents),
      dueAtUnix: BigInt(Math.floor(new Date(result.dueAt).getTime() / 1000)),
    });

    const sent = await provider.signAndSendTransaction(built.transaction);
    await built.connection.confirmTransaction({
      signature: sent.signature,
      blockhash: built.blockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
    }, "confirmed");

    setOnChainSignature(sent.signature);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setWorking(true);

    try {
      if (!profile?.solanaWallet) {
        throw new Error("Entre novamente usando sua carteira Solana.");
      }

      const data = new FormData(event.currentTarget);
      const file = data.get("evidence");
      if (!(file instanceof File) || file.size === 0) {
        throw new Error("Envie o comprovante do recebível.");
      }

      const sha256 = await evidenceCommitment(file);
      const evidence = evidenceMetadata(file, sha256);
      const amount = Number(data.get("amountUsd"));
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Informe um valor válido.");
      }

      const response = await fetch("/api/grp/receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experience,
          paymentPurpose: String(data.get("purpose")),
          paymentDescription: String(data.get("description")),
          nominalUsdCents: String(Math.round(amount * 100)),
          dueDate: String(data.get("dueDate")),
          payerCountry: String(data.get("payerCountry")).toUpperCase(),
          evidence,
        }),
      });

      const body = await response.json() as CreatedReceivable & { error?: string };
      if (!response.ok || !body.receivableId || !body.originatorWallet) {
        throw new Error(
          body.error === "GRP_ORIGINATOR_WALLET_NOT_CONFIGURED"
            ? "O ambiente GRP ainda não possui a carteira originadora configurada."
            : body.error ?? "Não foi possível criar o recebível.",
        );
      }

      setCreated(body);

      try {
        await registerOnChain(body);
      } catch (chainError) {
        setError(
          chainError instanceof Error
            ? `O cadastro privado foi salvo, mas falta registrar na Solana: ${chainError.message}`
            : "O cadastro privado foi salvo, mas falta registrar na Solana.",
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o recebível.");
    } finally {
      setWorking(false);
    }
  }

  async function retryOnChain() {
    if (!created) return;
    setWorking(true);
    setError("");
    try {
      await registerOnChain(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar na Solana.");
    } finally {
      setWorking(false);
    }
  }

  if (authenticated === null) {
    return <div className="dashboard-loading">Confirmando seu acesso…</div>;
  }

  if (!authenticated) {
    return (
      <div className="demo-callout">
        <strong>Entre para continuar.</strong>
        <a className="button button--primary" href={loginHref}>
          Entrar com carteira Solana
        </a>
      </div>
    );
  }

  if (created && onChainSignature) {
    return (
      <section className="demo-success">
        <CheckCircle2 aria-hidden="true" />
        <span className="kicker">{experience === "ERH" ? "Recebível registrado" : "Recebível registrado no GRP"}</span>
        <h2>Agora envie o link ao pagador.</h2>
        <p>
          {experience === "ERH"
            ? "Seu recebível foi registrado. Agora envie o link privado ao pagador para confirmar os dados e autorizar a liquidação em USDC."
            : "O recebível já possui estado público na Solana. O pagador verá os dados privados necessários e autorizará a liquidação em USDC com a própria carteira."}
        </p>
        <label>
          Link privado de confirmação
          <input value={created.confirmationUrl} readOnly />
        </label>
        <small>
          Solana: {onChainSignature.slice(0, 12)}…{onChainSignature.slice(-8)}
        </small>
        <div className="demo-actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(created.confirmationUrl);
              setCopied(true);
            }}
          >
            <Copy size={17} /> {copied ? "Copiado" : "Copiar link"}
          </button>
          <a
            className="button button--primary"
            href={created.confirmationUrl}
            target="_blank"
            rel="noreferrer"
          >
            Abrir como pagador <ExternalLink size={17} />
          </a>
          <Link className="button button--secondary" href={dashboardHref}>
            Ver no painel
          </Link>
        </div>
      </section>
    );
  }

  if (created && !onChainSignature) {
    return (
      <section className="confirmation-form">
        <FileCheck2 aria-hidden="true" />
        <h2>Cadastro privado salvo.</h2>
        <p>
          Falta apenas registrar o compromisso do recebível na Solana antes de enviar o link
          ao pagador.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="button button--primary"
          type="button"
          disabled={working}
          onClick={() => void retryOnChain()}
        >
          <WalletCards size={19} />
          {working ? "Aguardando carteira…" : "Registrar na Solana"}
        </button>
      </section>
    );
  }

  return (
    <form className="receivable-demo-form" onSubmit={submit}>
      <div className="demo-mode-banner">
        <WalletCards aria-hidden="true" />
        <span>
          <strong>{experience === "ERH" ? "Elas Recebem Hoje" : "Global Receivables Protocol"}</strong>{" "}
          {experience === "ERH"
            ? "Seus dados privados ficam protegidos. A infraestrutura GRP registra somente o compromisso financeiro necessário na Solana."
            : "Os dados privados ficam no banco. Somente o compromisso financeiro e o ciclo do recebível vão para a Solana."}
        </span>
      </div>

      <div className="form-grid">
        <label>
          Tipo do pagamento
          <select name="purpose" defaultValue="SERVICE" required>
            <option value="SERVICE">Prestação de serviço</option>
            <option value="SALARY">Salário</option>
            <option value="SALE">Venda</option>
            <option value="COMMISSION">Comissão</option>
            <option value="OTHER">Outro</option>
          </select>
        </label>

        <label>
          País do pagador
          <input name="payerCountry" defaultValue="US" minLength={2} maxLength={2} required />
        </label>
      </div>

      <label>
        Descrição do pagamento
        <input
          name="description"
          placeholder="Ex.: desenvolvimento de software para cliente internacional"
          minLength={3}
          maxLength={160}
          required
        />
      </label>

      <div className="form-grid">
        <label>
          Valor em USD
          <input name="amountUsd" type="number" min="1" step="0.01" required />
        </label>
        <label>
          Data prevista de pagamento
          <input name="dueDate" type="date" min={minDate} max={maxDate} required />
        </label>
      </div>

      <label>
        Comprovante
        <input name="evidence" type="file" accept=".pdf,.png,.jpg,.jpeg" required />
      </label>

      <p className="confirmation-form__note">
        Ao continuar, sua carteira assinará a criação do recebível no GRP. Nenhum USDC será
        movimentado nesta etapa.
      </p>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="button button--primary" disabled={working}>
        {working ? "Preparando recebível…" : experience === "ERH" ? "Criar recebível" : "Criar recebível no GRP"}
      </button>
    </form>
  );
}
