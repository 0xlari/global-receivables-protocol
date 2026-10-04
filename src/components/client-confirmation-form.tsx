"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BadgeCheck, ChevronDown, CircleAlert, LockKeyhole, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";

import { confirmDemoReceivable, findDemoReceivableByToken, setDemoPayerPayment } from "@/lib/demo-store";

type Details = { paymentDescription: string; paymentPurpose: "SERVICE" | "SALARY" | "SALE" | "COMMISSION" | "OTHER"; nominalUsdCents: string; dueAt: string; termsVersion: string };
type Authorization = { publicId: string; managementToken: string; method: "NWC_AUTOMATIC" | "MANUAL"; status: string; scheduledFor: string; expiresAt: string; supportedMethods?: readonly string[]; fingerprint?: string };
const purposeLabels: Record<Details["paymentPurpose"], string> = { SERVICE: "Prestação de serviço", SALARY: "Salário", SALE: "Venda", COMMISSION: "Comissão", OTHER: "Outro pagamento" };
const inputAmount = (cents: string) => `${BigInt(cents) / 100n}.${(BigInt(cents) % 100n).toString().padStart(2, "0")}`;

export function ClientConfirmationForm() {
  const [token, setToken] = useState("");
  const [receivableId, setReceivableId] = useState("");
  const [details, setDetails] = useState<Details>();
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [acceptsBtc, setAcceptsBtc] = useState(true);
  const [confirmsDescription, setConfirmsDescription] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "sending" | "error">("loading");
  const [step, setStep] = useState<"confirm" | "method" | "connect" | "summary" | "done">("confirm");
  const [result, setResult] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [authorization, setAuthorization] = useState<Authorization>();
  const [nwcUri, setNwcUri] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Referência demonstrativa de US$ 100 mil/BTC; a cotação definitiva será criada no vencimento.
  const maxAmountMsat = useMemo(() => details ? (BigInt(details.nominalUsdCents) * 1_000_000_000n / 10_000_000n).toString() : "0", [details]);
  const maxFeeMsat = useMemo(() => (BigInt(maxAmountMsat || "0") / 200n).toString(), [maxAmountMsat]);

  useEffect(() => {
    const demoToken = new URLSearchParams(window.location.search).get("demo") ?? "";
    const rawToken = demoToken || window.location.hash.slice(1);
    if (!demoToken) window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      await Promise.resolve();
      if (!rawToken) return setStatus("error");
      setToken(rawToken);
      if (demoToken) {
        const item = findDemoReceivableByToken(demoToken);
        if (!item || item.status !== "AWAITING_CLIENT") return setStatus("error");
        setDemoMode(true); setReceivableId(item.id);
        setDetails({ paymentDescription: item.description, paymentPurpose: item.purpose, nominalUsdCents: String(Math.round(item.amountUsd * 100)), dueAt: `${item.dueDate}T12:00:00.000Z`, termsVersion: "hackathon-demo-v1" });
        setAmount(item.amountUsd.toFixed(2)); setDueDate(item.dueDate); setStatus("ready"); return;
      }
      try {
        const response = await fetch("/api/client-confirmations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "inspect", token: rawToken }), cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json() as Details;
        setDetails(data); setAmount(inputAmount(data.nominalUsdCents)); setDueDate(data.dueAt.slice(0, 10)); setStatus("ready");
      } catch { setStatus("error"); }
    })();
  }, []);

  async function submitConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!details) return; setStatus("sending");
    try {
      if (demoMode) {
        confirmDemoReceivable(token, acceptsBtc && confirmsDescription);
        if (acceptsBtc && confirmsDescription) { setStep("method"); setStatus("ready"); return; }
        setResult("Recusa registrada. Este recebível não poderá criar uma pool."); setStep("done"); setStatus("ready"); return;
      }
      const response = await fetch("/api/client-confirmations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "respond", token, acceptsBtc, confirmsDescription, amountUsd: amount, dueDate, termsVersion: details.termsVersion }) });
      const data = await response.json() as { receivableId?: string; outcome?: string; error?: string };
      if (!response.ok || !data.outcome) throw new Error(data.error ?? "Não foi possível registrar a resposta.");
      if (data.outcome === "ACCEPTED" && data.receivableId) { setReceivableId(data.receivableId); setStep("method"); setStatus("ready"); return; }
      setResult(data.outcome === "DIVERGED" ? "Divergência registrada. A solicitante deverá corrigir e enviar um novo link." : "Recusa registrada. Este recebível não poderá criar uma pool."); setStep("done"); setStatus("ready");
    } catch (cause) { setResult(cause instanceof Error ? cause.message : "Não foi possível registrar a resposta."); setStatus("error"); }
  }

  async function chooseMethod(method: "NWC_AUTOMATIC" | "MANUAL") {
    setStatus("sending");
    try {
      if (demoMode) {
        const nextStatus = method === "MANUAL" ? "MANUAL_PAYMENT_REQUIRED" : "PENDING_CONNECTION";
        setDemoPayerPayment(receivableId, method, nextStatus);
        setAuthorization({ publicId: crypto.randomUUID(), managementToken: "demo-session-only", method, status: nextStatus, scheduledFor: `${dueDate}T12:00:00.000Z`, expiresAt: `${dueDate}T23:59:59.000Z` });
        setStep(method === "MANUAL" ? "summary" : "connect"); setStatus("ready"); return;
      }
      const response = await fetch(`/api/receivables/${encodeURIComponent(receivableId)}/payment-authorization`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmationToken: token, method, maxAmountMsat, maxFeeMsat }) });
      const data = await response.json() as Authorization & { error?: string };
      if (!response.ok || !data.publicId) throw new Error(data.error ?? "Não foi possível salvar a forma de pagamento.");
      setAuthorization(data); sessionStorage.setItem(`payer-payment:${data.publicId}`, data.managementToken);
      setStep(method === "MANUAL" ? "summary" : "connect"); setStatus("ready");
    } catch (cause) { setResult(cause instanceof Error ? cause.message : "Não foi possível salvar a forma de pagamento."); setStatus("error"); }
  }

  async function saveNwcConnection(connectionUri: string) {
    if (!authorization) return; setStatus("sending"); setResult("");
    try {
      if (demoMode) {
        if (!/^nostr\+walletconnect:\/\/[a-f0-9]{64}\?/i.test(connectionUri)) throw new Error("A carteira não devolveu uma conexão NWC válida.");
        setDemoPayerPayment(receivableId, "NWC_AUTOMATIC", "ACTIVE", "Carteira Lightning");
        setAuthorization({ ...authorization, status: "ACTIVE", supportedMethods: ["pay_invoice"], fingerprint: "simulação-protegida" }); setStep("summary"); setStatus("ready"); return;
      }
      const response = await fetch(`/api/payment-authorizations/${authorization.publicId}/nwc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managementToken: authorization.managementToken, nwcUri: connectionUri }) });
      const data = await response.json() as { status?: string; supportedMethods?: string[]; fingerprint?: string; error?: string };
      if (!response.ok || data.status !== "ACTIVE") throw new Error(data.error ?? "Não foi possível validar a conexão NWC.");
      setNwcUri(""); setAuthorization({ ...authorization, status: data.status, supportedMethods: data.supportedMethods, fingerprint: data.fingerprint }); setStep("summary"); setStatus("ready");
    } catch (cause) { setResult(cause instanceof Error ? cause.message : "Não foi possível validar a conexão NWC."); setStatus("error"); }
  }

  async function connectWallet() {
    setStatus("sending"); setResult("");
    try {
      const bitcoinConnect = await import("@getalby/bitcoin-connect-react");
      bitcoinConnect.init({
        appName: "Elas Recebem Hoje",
        filters: ["nwc"],
        showBalance: false,
        persistConnection: false,
        providerConfig: { nwc: { authorizationUrlOptions: { requestMethods: ["pay_invoice"] } } },
      });
      const provider = await bitcoinConnect.requestProvider();
      const connectionUri = (provider as { client?: { nostrWalletConnectUrl?: string } }).client?.nostrWalletConnectUrl;
      if (!connectionUri) throw new Error("Esta carteira não forneceu uma autorização NWC para pagamento automático. Tente outra carteira compatível ou escolha o pagamento manual.");
      await saveNwcConnection(connectionUri);
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Não foi possível conectar a carteira.");
      setStatus("error");
    }
  }

  async function connectNwc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveNwcConnection(nwcUri);
  }

  async function revoke() {
    if (!authorization) return; setStatus("sending");
    try {
      if (!demoMode) {
        const response = await fetch(`/api/payment-authorizations/${authorization.publicId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managementToken: authorization.managementToken }) });
        if (!response.ok) throw new Error("A autorização não pôde ser revogada.");
      }
      if (demoMode) setDemoPayerPayment(receivableId, authorization.method, "REVOKED");
      setAuthorization({ ...authorization, status: "REVOKED" }); setStatus("ready");
    } catch (cause) { setResult(cause instanceof Error ? cause.message : "A autorização não pôde ser revogada."); setStatus("error"); }
  }

  async function switchToManual() {
    if (!authorization) return; setStatus("sending");
    try {
      if (!demoMode) {
        const response = await fetch(`/api/payment-authorizations/${authorization.publicId}/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managementToken: authorization.managementToken }) });
        if (!response.ok) throw new Error("A forma de pagamento não pôde ser alterada.");
      } else setDemoPayerPayment(receivableId, "MANUAL", "MANUAL_PAYMENT_REQUIRED");
      setAuthorization({ ...authorization, method: "MANUAL", status: "MANUAL_PAYMENT_REQUIRED" }); setStatus("ready");
    } catch (cause) { setResult(cause instanceof Error ? cause.message : "A forma de pagamento não pôde ser alterada."); setStatus("error"); }
  }

  if (status === "loading") return <div className="confirmation-state">Validando o link com segurança…</div>;
  if (status === "error" && !details) return <div className="confirmation-state confirmation-state--error"><CircleAlert /><strong>Este link é inválido, expirou ou já foi usado.</strong><span>Peça à solicitante um novo link.</span></div>;
  if (step === "done") return <div className="confirmation-state confirmation-state--done"><BadgeCheck /><strong>Resposta concluída</strong><span>{result}</span></div>;

  if (step === "method") return <section className="payment-choice"><div className="confirmation-form__security"><ShieldCheck /> Recebível confirmado. Agora escolha como pretende pagar no vencimento.</div><h2>Como você deseja realizar o pagamento?</h2><div className="payment-choice__grid"><article><WalletCards /><h3>Ativar pagamento automático</h3><p>Conecte uma carteira Lightning compatível com Nostr Wallet Connect para autorizar o pagamento deste recebível no vencimento.</p><button className="button button--primary" onClick={() => void chooseMethod("NWC_AUTOMATIC")}>Conectar carteira para pagamento automático</button><small>Requer NWC. Sua carteira permanece sob seu controle e a conexão pode ser revogada.</small></article><article><RefreshCw /><h3>Pagar manualmente no vencimento</h3><p>Você receberá uma invoice no vencimento e poderá pagar usando qualquer carteira Lightning.</p><button className="button button--secondary" onClick={() => void chooseMethod("MANUAL")}>Pagar manualmente no vencimento</button></article></div>{status === "error" ? <p className="form-error">{result}</p> : null}</section>;

  if (step === "connect" && authorization) return (
    <section className="confirmation-form nwc-connect">
      <div className="demo-banner">Modo {demoMode ? "demonstrativo" : "controlado"}: conectar não realiza pagamento.</div>
      <div className="nwc-connect__intro">
        <WalletCards />
        <div>
          <h2>Programe o pagamento deste recebível</h2>
          <p>Conecte uma carteira Lightning compatível. Você aprovará o acesso dentro da própria carteira e nada será cobrado agora.</p>
        </div>
      </div>

      <div className="authorization-review">
        <h3>O que será autorizado</h3>
        <dl>
          <div><dt>Recebível</dt><dd>{details?.paymentDescription}</dd></div>
          <div><dt>Valor nominal</dt><dd>US$ {amount}</dd></div>
          <div><dt>Limite máximo</dt><dd>{(BigInt(maxAmountMsat) / 1_000n).toLocaleString("pt-BR")} sats</dd></div>
          <div><dt>Vencimento</dt><dd>{new Date(`${dueDate}T12:00:00`).toLocaleDateString("pt-BR")}</dd></div>
          <div><dt>Uso</dt><dd>Único e revogável</dd></div>
          <div><dt>Tarifa máxima</dt><dd>{(BigInt(maxFeeMsat) / 1_000n).toLocaleString("pt-BR")} sats</dd></div>
        </dl>
      </div>

      <button className="button button--primary nwc-connect__primary" type="button" disabled={status === "sending"} onClick={() => void connectWallet()}>
        <WalletCards size={19} /> {status === "sending" ? "Abrindo sua carteira…" : "Conectar minha carteira"}
      </button>
      <p className="confirmation-form__note">No celular, sua carteira pode abrir automaticamente. No computador, você poderá escanear com a câmera da própria carteira. Solicitamos somente permissão para pagar esta invoice no vencimento.</p>

      {status === "error" ? <p className="form-error">{result}</p> : null}

      <button className="button button--ghost nwc-connect__advanced-toggle" type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((current) => !current)}>
        <ChevronDown className={showAdvanced ? "is-open" : ""} size={18} /> Opções avançadas
      </button>

      {showAdvanced ? (
        <form className="nwc-connect__advanced" onSubmit={connectNwc}>
          <h3>Conectar manualmente</h3>
          <p>Use esta opção somente se sua carteira já forneceu uma conexão NWC.</p>
          <label>Conexão NWC
            <input type="password" value={nwcUri} onChange={(event) => setNwcUri(event.target.value)} placeholder="nostr+walletconnect://…" required autoComplete="off" spellCheck={false} />
          </label>
          <button className="button button--secondary" disabled={status === "sending"}>Usar conexão avançada</button>
        </form>
      ) : null}

      <button className="button button--ghost" type="button" disabled={status === "sending"} onClick={() => void switchToManual()}>Prefiro pagar manualmente no vencimento</button>
    </section>
  );

  if (step === "summary" && authorization) return <section className="payment-summary"><div className="confirmation-state confirmation-state--done"><BadgeCheck /><strong>{authorization.method === "NWC_AUTOMATIC" ? "Pagamento automático ativo" : "Pagamento manual escolhido"}</strong><span>{authorization.method === "NWC_AUTOMATIC" ? "Carteira conectada via Nostr Wallet Connect" : "Uma invoice Lightning será disponibilizada no vencimento."}</span></div><dl><div><dt>Status</dt><dd>{authorization.status}</dd></div><div><dt>Pagamento previsto</dt><dd>{new Date(authorization.scheduledFor).toLocaleDateString("pt-BR")}</dd></div><div><dt>Valor máximo autorizado</dt><dd>{(BigInt(maxAmountMsat) / 1_000n).toLocaleString("pt-BR")} sats</dd></div><div><dt>Validade</dt><dd>{new Date(authorization.expiresAt).toLocaleDateString("pt-BR")}</dd></div></dl><p>O pagamento automático não é garantido: pode falhar por saldo, quota, tarifa, rota, conexão offline ou revogação.</p>{authorization.method === "NWC_AUTOMATIC" && authorization.status !== "REVOKED" ? <button className="button button--ghost" onClick={() => void switchToManual()}>Trocar para pagamento manual</button> : null}{authorization.status !== "REVOKED" ? <button className="button button--secondary" onClick={() => void revoke()}>Revogar autorização</button> : <p><strong>Autorização revogada.</strong> Nenhum débito automático será solicitado.</p>}</section>;

  return <form className="confirmation-form" onSubmit={submitConfirmation}><div className="confirmation-form__security"><LockKeyhole /> {demoMode ? "Confirmação demonstrativa: a assinatura é simulada e nenhum sat é movimentado." : "Link de uso único. A aportadora não recebe nem valida estes dados."}</div><label>Origem do pagamento<input value={details ? purposeLabels[details.paymentPurpose] : ""} readOnly /></label><label>Descrição do pagamento<input value={details?.paymentDescription ?? ""} readOnly /></label><label><input type="checkbox" checked={confirmsDescription} onChange={(event) => setConfirmsDescription(event.target.checked)} /> Confirmo que reconheço a origem e a descrição deste pagamento.</label><div className="confirmation-form__grid"><label>Valor em USD<input value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>Data de pagamento<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label></div><fieldset><legend>Você aceita pagar este recebível em Bitcoin (BTC)?</legend><label><input type="radio" name="btc" checked={acceptsBtc} onChange={() => setAcceptsBtc(true)} /> Sim, aceito pagar em BTC</label><label><input type="radio" name="btc" checked={!acceptsBtc} onChange={() => setAcceptsBtc(false)} /> Não aceito pagar em BTC</label></fieldset><p className="confirmation-form__note">A confirmação não movimenta sats. Depois dela, escolha NWC automático ou pagamento manual com qualquer carteira Lightning.</p>{status === "error" ? <p className="form-error">{result}</p> : null}<button className="button button--primary" disabled={status === "sending"}>{status === "sending" ? "Registrando…" : demoMode ? "Simular assinatura e confirmar" : "Registrar minha resposta"}</button></form>;
}
