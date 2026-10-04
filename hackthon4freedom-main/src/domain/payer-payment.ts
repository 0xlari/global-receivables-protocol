import { DomainError } from "./errors";

export const payerPaymentMethods = ["NWC_AUTOMATIC", "MANUAL"] as const;
export type PayerPaymentMethod = (typeof payerPaymentMethods)[number];

export const payerPaymentAuthorizationStatuses = [
  "PENDING_CONNECTION",
  "ACTIVE",
  "INVALID",
  "REVOKED",
  "EXPIRED",
  "PAYMENT_PENDING",
  "PAID",
  "FAILED",
  "MANUAL_PAYMENT_REQUIRED",
] as const;
export type PayerPaymentAuthorizationStatus =
  (typeof payerPaymentAuthorizationStatuses)[number];

export const scheduledPaymentAttemptStatuses = [
  "SCHEDULED",
  "INVOICE_CREATED",
  "REQUEST_SENT",
  "PENDING",
  "SETTLED",
  "FAILED",
  "UNKNOWN",
  "CANCELLED",
] as const;
export type ScheduledPaymentAttemptStatus =
  (typeof scheduledPaymentAttemptStatuses)[number];

export const nwcConnectionStatuses = [
  "ACTIVE",
  "INVALID",
  "REVOKED",
] as const;
export type NwcConnectionStatus = (typeof nwcConnectionStatuses)[number];

export const nwcFailureCodes = [
  "INSUFFICIENT_BALANCE",
  "QUOTA_EXCEEDED",
  "RESTRICTED",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "PAYMENT_FAILED",
  "NOT_IMPLEMENTED",
  "INTERNAL",
  "TIMEOUT",
  "RELAY_UNAVAILABLE",
  "INVALID_RESPONSE",
  "UNKNOWN_RESULT",
] as const;
export type NwcFailureCode = (typeof nwcFailureCodes)[number];

const authorizationTransitions: Readonly<
  Record<PayerPaymentAuthorizationStatus, readonly PayerPaymentAuthorizationStatus[]>
> = {
  PENDING_CONNECTION: ["ACTIVE", "INVALID", "REVOKED", "EXPIRED", "MANUAL_PAYMENT_REQUIRED"],
  ACTIVE: ["INVALID", "REVOKED", "EXPIRED", "PAYMENT_PENDING", "MANUAL_PAYMENT_REQUIRED"],
  INVALID: ["ACTIVE", "REVOKED", "EXPIRED", "MANUAL_PAYMENT_REQUIRED"],
  REVOKED: [],
  EXPIRED: ["MANUAL_PAYMENT_REQUIRED"],
  PAYMENT_PENDING: ["PAID", "FAILED", "MANUAL_PAYMENT_REQUIRED"],
  PAID: [],
  FAILED: ["MANUAL_PAYMENT_REQUIRED"],
  MANUAL_PAYMENT_REQUIRED: ["PAYMENT_PENDING", "PAID", "REVOKED", "EXPIRED"],
};

export function transitionPayerPaymentAuthorization(
  current: PayerPaymentAuthorizationStatus,
  next: PayerPaymentAuthorizationStatus,
) {
  if (!authorizationTransitions[current].includes(next)) {
    throw new DomainError(
      `Transição de autorização inválida: ${current} -> ${next}.`,
      "INVALID_STATE_TRANSITION",
    );
  }
  return next;
}

export function assertPaymentAttemptAllowed(input: {
  amountMsat: bigint;
  maxAmountMsat: bigint;
  now: Date;
  scheduledFor: Date;
  expiresAt: Date;
  status: PayerPaymentAuthorizationStatus;
  usedAt?: Date | null;
  revokedAt?: Date | null;
}) {
  if (input.amountMsat <= 0n || input.amountMsat > input.maxAmountMsat) {
    throw new DomainError("Valor fora do limite autorizado.", "PAYMENT_LIMIT_EXCEEDED");
  }
  if (input.now < input.scheduledFor) {
    throw new DomainError("Pagamento ainda não venceu.", "PAYMENT_NOT_DUE");
  }
  if (input.now >= input.expiresAt) {
    throw new DomainError("Autorização expirada.", "PAYMENT_AUTHORIZATION_EXPIRED");
  }
  if (input.revokedAt || input.status === "REVOKED") {
    throw new DomainError("Autorização revogada.", "PAYMENT_AUTHORIZATION_REVOKED");
  }
  if (input.usedAt || input.status === "PAID") {
    throw new DomainError("Autorização de uso único já utilizada.", "PAYMENT_ALREADY_USED");
  }
  if (input.status !== "ACTIVE" && input.status !== "MANUAL_PAYMENT_REQUIRED") {
    throw new DomainError("Autorização não está ativa.", "PAYMENT_AUTHORIZATION_INACTIVE");
  }
}

export function safeNwcFailureReason(code: NwcFailureCode): string {
  const messages: Record<NwcFailureCode, string> = {
    INSUFFICIENT_BALANCE: "Saldo insuficiente para concluir o pagamento.",
    QUOTA_EXCEEDED: "O limite configurado na carteira foi atingido.",
    RESTRICTED: "A carteira restringiu esta operação.",
    UNAUTHORIZED: "A conexão com a carteira não está mais autorizada.",
    RATE_LIMITED: "A carteira recebeu muitas solicitações.",
    PAYMENT_FAILED: "A rede Lightning não conseguiu concluir o pagamento.",
    NOT_IMPLEMENTED: "A carteira não oferece o recurso necessário.",
    INTERNAL: "A carteira não conseguiu processar a solicitação.",
    TIMEOUT: "A carteira não respondeu dentro do prazo.",
    RELAY_UNAVAILABLE: "A conexão com a carteira está temporariamente indisponível.",
    INVALID_RESPONSE: "A carteira retornou uma resposta inválida.",
    UNKNOWN_RESULT: "O resultado ainda precisa ser conciliado.",
  };
  return messages[code];
}
