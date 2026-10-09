"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  BadgeCheck,
  CircleAlert,
  LockKeyhole,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { PublicKey } from "@solana/web3.js";

import {
  confirmDemoReceivable,
  findDemoReceivableByToken,
} from "@/lib/demo-store";
import {
  buildManualRepaymentTransaction,
  buildPayerConfirmationTransaction,
  getPayerCommitmentStatus,
  payerCommitmentHash,
  type BrowserSolanaProvider,
} from "@/lib/grp-solana";

type Details = {
  paymentDescription: string;
  paymentPurpose: "SERVICE" | "SALARY" | "SALE" | "COMMISSION" | "OTHER";
  nominalUsdCents: string;
  dueAt: string;
  termsVersion: string;
  receivableId?: string;
  requesterSolanaWallet?: string | null;
  grpUsdcMint?: string | null;
  confirmationStatus?: "PENDING" | "ACCEPTED";
  confirmationExpiresAt?: string;
};

type Step = "confirm" | "authorize" | "pay" | "done";
type State = "loading" | "ready" | "sending" | "error";

const purposeLabels: Record<Details["paymentPurpose"], string> = {
  SERVICE: "Prestação de serviço",
  SALARY: "Salário",
  SALE: "Venda",
  COMMISSION: "Comissão",
  OTHER: "Outro pagamento",
};

const inputAmount = (cents: string) =>
  `${BigInt(cents) / 100n}.${(BigInt(cents) % 100n).toString().padStart(2, "0")}`;

function usdCentsToUsdcMinor(cents: bigint) {
  // 1 USDC uses 6 decimals; the MVP receivable is denominated in USD reference value.
  return cents * 10_000n;
}

function browserWallet() {
  return (window as Window & { solana?: BrowserSolanaProvider }).solana;
}

export function ClientConfirmationForm() {
  const [token, setToken] = useState("");
  const [details, setDetails] = useState<Details>();
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [acceptsUsdc, setAcceptsUsdc] = useState(true);
  const [confirmsDescription, setConfirmsDescription] = useState(true);
  const [state, setState] = useState<State>("loading");
  const [step, setStep] = useState<Step>("confirm");
  const [message, setMessage] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState("");

  const usdcMinorAmount = details
    ? usdCentsToUsdcMinor(BigInt(details.nominalUsdCents))
    : 0n;

  useEffect(() => {
    const demoToken = new URLSearchParams(window.location.search).get("demo") ?? "";
    const rawToken = demoToken || window.location.hash.slice(1);

    void (async () => {
      await Promise.resolve();
      if (!rawToken) {
        setState("error");
        return;
      }

      setToken(rawToken);

      if (demoToken) {
        const item = findDemoReceivableByToken(demoToken);
        if (!item || item.status !== "AWAITING_CLIENT") {
          setState("error");
          return;
        }
        setDemoMode(true);
        setDetails({
          paymentDescription: item.description,
          paymentPurpose: item.purpose,
          nominalUsdCents: String(Math.round(item.amountUsd * 100)),
          dueAt: `${item.dueDate}T12:00:00.000Z`,
          termsVersion: "hackathon-demo-v1",
          receivableId: item.id,
        });
        setAmount(item.amountUsd.toFixed(2));
        setDueDate(item.dueDate);
        setState("ready");
        return;
      }

      try {
        const response = await fetch("/api/grp/client-confirmations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "inspect", token: rawToken }),
          cache: "no-store",
        });
        const data = (await response.json()) as Details & { error?: string; code?: string };
        if (!response.ok) {
          throw new Error(
            data.code === "INVALID_OR_EXPIRED_CONFIRMATION"
              ? "Este link é inválido, expirou ou já foi utilizado."
              : data.error ?? "Não foi possível validar o link.",
          );
        }

        setDetails(data);
        setAmount(inputAmount(data.nominalUsdCents));
        setDueDate(data.dueAt.slice(0, 10));
        if (data.confirmationStatus === "ACCEPTED" && data.receivableId && data.requesterSolanaWallet) {
          const requester = new PublicKey(data.requesterSolanaWallet);
          const commitment = await getPayerCommitmentStatus({
            requester,
            receivableId: data.receivableId,
          });
          if (commitment.exists) {
            if (Date.now() >= new Date(data.dueAt).getTime()) {
              setStep("pay");
            } else {
              setMessage("Compromisso registrado. O pagamento será liberado no vencimento.");
              setStep("done");
            }
          } else {
            setStep("authorize");
          }
        } else if (data.confirmationStatus === "ACCEPTED") {
          setStep("authorize");
        }
        setState("ready");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Não foi possível validar o link.");
        setState("error");
      }
    })();
  }, []);

  async function submitConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!details) return;

    setState("sending");
    setMessage("");

    try {
      if (demoMode) {
        confirmDemoReceivable(token, acceptsUsdc && confirmsDescription);
        if (!acceptsUsdc || !confirmsDescription) {
          setMessage("Recusa ou divergência registrada.");
          setStep("done");
          setState("ready");
          return;
        }

        setMessage(
          "Confirmação demonstrativa registrada. O compromisso Solana não é executado no modo demo.",
        );
        setStep("done");
        setState("ready");
        return;
      }

      const response = await fetch("/api/grp/client-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "respond",
          token,
          acceptsUsdc,
          confirmsDescription,
          amountUsd: amount,
          dueDate,
          termsVersion: details.termsVersion,
        }),
      });

      const data = (await response.json()) as {
        receivableId?: string;
        outcome?: string;
        error?: string;
        code?: string;
      };

      if (!response.ok || !data.outcome) {
        throw new Error(data.error ?? "Não foi possível registrar a resposta.");
      }

      if (data.outcome !== "ACCEPTED") {
        setMessage(
          data.outcome === "DIVERGED"
            ? "Divergência registrada. A solicitante deverá corrigir e enviar um novo link."
            : "Recusa registrada. Este recebível não poderá seguir para financiamento.",
        );
        setStep("done");
        setState("ready");
        return;
      }

      setDetails((current) =>
        current ? { ...current, receivableId: data.receivableId ?? current.receivableId } : current,
      );
      setStep("authorize");
      setState("ready");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível registrar a confirmação.",
      );
      setState("error");
    }
  }

  async function authorizeOnSolana() {
    if (!details?.receivableId) return;

    setState("sending");
    setMessage("");

    try {
      if (!details.requesterSolanaWallet) {
        throw new Error(
          "Este recebível ainda não possui a carteira Solana da solicitante vinculada.",
        );
      }
      if (!details.grpUsdcMint) {
        throw new Error(
          "O mint USDC do GRP ainda não foi configurado para este ambiente.",
        );
      }

      const provider = browserWallet();
      if (!provider?.connect || !provider.signAndSendTransaction) {
        throw new Error(
          "Nenhuma carteira Solana compatível foi encontrada neste navegador.",
        );
      }

      const connected = await provider.connect();
      const payer = new PublicKey(connected.publicKey.toBase58());
      const requester = new PublicKey(details.requesterSolanaWallet);
      const usdcMint = new PublicKey(details.grpUsdcMint);
      const commitment = await payerCommitmentHash({
        receivableId: details.receivableId,
        amountUsdcMinor: usdcMinorAmount,
        dueAt: details.dueAt,
        usdcMint: usdcMint.toBase58(),
      });

      const built = await buildPayerConfirmationTransaction({
        payer,
        requester,
        receivableId: details.receivableId,
        authorizedAmount: usdcMinorAmount,
        payerCommitmentHash: commitment,
      });

      const sent = await provider.signAndSendTransaction(built.transaction);
      await built.connection.confirmTransaction(sent.signature, "confirmed");

      setTransactionSignature(sent.signature);
      setMessage(
        "Recebível confirmado e compromisso on-chain registrado na Solana.",
      );
      setStep("done");
      setState("ready");
    } catch (error) {
      const raw = error instanceof Error
        ? error.message
        : "Não foi possível registrar o compromisso na Solana.";
      const friendly =
        raw === "GRP_PROTOCOL_NOT_AVAILABLE_ON_DEVNET"
          ? "O protocolo GRP não foi encontrado na Solana Devnet. Confirme que a carteira está em Devnet, não em Testnet."
          : raw === "GRP_RECEIVABLE_NOT_FOUND_ON_DEVNET"
            ? "Este recebível não foi encontrado na Solana Devnet. Volte à solicitante e confirme se a criação on-chain foi concluída."
            : raw === "GRP_USDC_MINT_NOT_FOUND_ON_DEVNET"
              ? "O USDC configurado para o GRP não existe na Devnet."
              : raw === "PAYER_NEEDS_DEVNET_SOL"
                ? "A carteira do pagador precisa de um pequeno saldo de SOL na Solana Devnet para registrar o compromisso."
                : /simulation|revert|failed to simulate|insufficient funds/i.test(raw)
                  ? "A carteira não conseguiu simular a transação na Solana Devnet. Confirme a rede Devnet e um pequeno saldo de SOL para taxas/rent."
                  : raw;
      setMessage(friendly);
      setState("error");
    }
  }


  async function payOnSolana() {
    if (!details?.receivableId || !details.requesterSolanaWallet || !details.grpUsdcMint) {
      setMessage("Este recebível não possui todos os dados necessários para pagamento.");
      setState("error");
      return;
    }

    setState("sending");
    setMessage("");

    try {
      if (Date.now() < new Date(details.dueAt).getTime()) {
        throw new Error("O pagamento só pode ser feito a partir do vencimento.");
      }

      const provider = browserWallet();
      if (!provider?.connect || !provider.signAndSendTransaction) {
        throw new Error("Nenhuma carteira Solana compatível foi encontrada neste navegador.");
      }

      const connected = await provider.connect();
      const payer = new PublicKey(connected.publicKey.toBase58());
      const requester = new PublicKey(details.requesterSolanaWallet);
      const usdcMint = new PublicKey(details.grpUsdcMint);

      const built = await buildManualRepaymentTransaction({
        payer,
        requester,
        receivableId: details.receivableId,
        usdcMint,
        amountUsdcMinor: usdcMinorAmount,
      });

      const sent = await provider.signAndSendTransaction(built.transaction);
      await built.connection.confirmTransaction(
        {
          signature: sent.signature,
          blockhash: built.blockhash,
          lastValidBlockHeight: built.lastValidBlockHeight,
        },
        "confirmed",
      );

      const response = await fetch("/api/grp/client-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settle",
          token,
          signature: sent.signature,
        }),
      });
      const body = await response.json() as { error?: string; outcome?: string };
      if (!response.ok || body.outcome !== "PAID") {
        throw new Error(body.error ?? "O pagamento confirmou, mas não pôde ser sincronizado.");
      }

      setTransactionSignature(sent.signature);
      setMessage("Pagamento concluído em USDC. O recebível foi liquidado no GRP.");
      setStep("done");
      setState("ready");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Não foi possível concluir o pagamento.";
      const friendly =
        raw === "PAYER_USDC_ACCOUNT_NOT_FOUND"
          ? "Essa carteira não possui o USDC de teste configurado no GRP."
          : raw === "INSUFFICIENT_DEVNET_USDC"
            ? "Saldo de USDC Devnet insuficiente para liquidar este recebível."
            : raw === "PAYER_NEEDS_DEVNET_SOL"
              ? "A carteira do pagador precisa de um pequeno saldo de SOL Devnet para taxas."
              : raw === "GRP_PAYER_COMMITMENT_NOT_FOUND"
                ? "O compromisso do pagador não foi encontrado on-chain."
                : /simulation|failed to simulate|revert/i.test(raw)
                  ? "A Solana recusou o pagamento. Confirme Devnet, saldo de SOL, saldo de USDC e se o vencimento já chegou."
                  : raw;
      setMessage(friendly);
      setState("error");
    }
  }

  if (state === "loading") {
    return <div className="confirmation-state">Validando o link com segurança…</div>;
  }

  if (state === "error" && !details) {
    return (
      <div className="confirmation-state confirmation-state--error">
        <CircleAlert />
        <strong>Não foi possível abrir este recebível.</strong>
        <span>{message || "Este link é inválido, expirou ou já foi utilizado."}</span>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="confirmation-state confirmation-state--done">
        <BadgeCheck />
        <strong>Confirmação concluída</strong>
        <span>{message}</span>
        {transactionSignature ? (
          <small>Transação: {transactionSignature.slice(0, 12)}…{transactionSignature.slice(-8)}</small>
        ) : null}
      </div>
    );
  }

  if (step === "pay" && details) {
    return (
      <section className="confirmation-form">
        <div className="confirmation-form__security">
          <ShieldCheck />
          O compromisso já está registrado no GRP. O pagamento exige uma nova assinatura sua.
        </div>

        <h2>Liquidar recebível em USDC</h2>
        <p>
          O GRP não possui autorização de débito automático. O USDC só sai da sua carteira
          depois que você confirmar esta transação na Phantom.
        </p>

        <dl className="authorization-review">
          <div><dt>Recebível</dt><dd>{details.paymentDescription}</dd></div>
          <div><dt>Valor</dt><dd>USDC {amount}</dd></div>
          <div><dt>Vencimento</dt><dd>{new Date(details.dueAt).toLocaleDateString("pt-BR")}</dd></div>
          <div><dt>Destino</dt><dd>Settlement vault do GRP</dd></div>
        </dl>

        {state === "error" && message ? <p className="form-error">{message}</p> : null}

        <button
          className="button button--primary"
          type="button"
          disabled={state === "sending"}
          onClick={() => void payOnSolana()}
        >
          <WalletCards size={19} />
          {state === "sending" ? "Aguardando carteira…" : "Pagar em USDC"}
        </button>
      </section>
    );
  }

  if (step === "authorize" && details) {
    return (
      <section className="confirmation-form">
        <div className="confirmation-form__security">
          <ShieldCheck />
          O recebível foi confirmado. Registre agora o compromisso on-chain.
        </div>

        <h2>Confirme o compromisso de pagamento</h2>
        <p>
          Sua carteira continuará sob seu controle. O GRP registra apenas o compromisso deste recebível. Nenhuma permissão de débito futuro é criada.
        </p>

        <dl className="authorization-review">
          <div><dt>Recebível</dt><dd>{details.paymentDescription}</dd></div>
          <div><dt>Valor máximo</dt><dd>USDC {amount}</dd></div>
          <div><dt>Vencimento</dt><dd>{new Date(details.dueAt).toLocaleDateString("pt-BR")}</dd></div>
          <div><dt>Compromisso</dt><dd>Sem débito automático</dd></div>
        </dl>

        <div className="confirmation-form__security">
          <LockKeyhole />
          Rede obrigatória: Solana Devnet. Esta transação registra somente o compromisso do pagador. Nenhum USDC é transferido e nenhuma permissão de débito futuro é criada.
        </div>

        {state === "error" && message ? <p className="form-error">{message}</p> : null}

        <button
          className="button button--primary"
          type="button"
          disabled={state === "sending"}
          onClick={() => void authorizeOnSolana()}
        >
          <WalletCards size={19} />
          {state === "sending" ? "Aguardando carteira…" : "Conectar carteira e registrar compromisso"}
        </button>
      </section>
    );
  }

  return (
    <form className="confirmation-form" onSubmit={submitConfirmation}>
      <div className="confirmation-form__security">
        <LockKeyhole />
        {demoMode
          ? "Confirmação demonstrativa: nenhum ativo é movimentado."
          : "Link de uso único. Os documentos privados não são publicados na Solana."}
      </div>

      <label>
        Origem do pagamento
        <input value={details ? purposeLabels[details.paymentPurpose] : ""} readOnly />
      </label>

      <label>
        Descrição do pagamento
        <input value={details?.paymentDescription ?? ""} readOnly />
      </label>

      <label>
        <input
          type="checkbox"
          checked={confirmsDescription}
          onChange={(event) => setConfirmsDescription(event.target.checked)}
        />
        Confirmo que reconheço a origem e a descrição deste pagamento.
      </label>

      <div className="confirmation-form__grid">
        <label>
          Valor em USD
          <input value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <label>
          Data de pagamento
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            required
          />
        </label>
      </div>

      <fieldset>
        <legend>Você aceita liquidar este recebível em USDC na Solana?</legend>
        <label>
          <input
            type="radio"
            name="usdc"
            checked={acceptsUsdc}
            onChange={() => setAcceptsUsdc(true)}
          />
          Sim, aceito pagar em USDC
        </label>
        <label>
          <input
            type="radio"
            name="usdc"
            checked={!acceptsUsdc}
            onChange={() => setAcceptsUsdc(false)}
          />
          Não aceito pagar em USDC
        </label>
      </fieldset>

      <p className="confirmation-form__note">
        A confirmação desta etapa não movimenta fundos. Se você aceitar, a próxima etapa conecta sua carteira e registra apenas o compromisso on-chain deste recebível.
      </p>

      {state === "error" && message ? <p className="form-error">{message}</p> : null}

      <button className="button button--primary" disabled={state === "sending"}>
        {state === "sending" ? "Registrando…" : "Confirmar recebível"}
      </button>
    </form>
  );
}
