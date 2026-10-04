import { z } from "zod";

import { DomainError } from "./errors";

export const RECEIVABLE_TERMS_VERSION = "receivable-btc-v2";
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const paymentPurposes = [
  "SERVICE",
  "SALARY",
  "SALE",
  "COMMISSION",
  "OTHER",
] as const;
export type PaymentPurpose = (typeof paymentPurposes)[number];

const allowedEvidenceTypes = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
} as const;

export type EvidenceMetadata = Readonly<{
  privateObjectReference: string;
  sha256: string;
  extension: string;
  declaredMimeType: string;
  detectedMimeType: string;
  byteSize: number;
  scanStatus: "PENDING" | "CLEAN" | "INFECTED" | "UNSUPPORTED";
}>;

export type ReceivableTerms = Readonly<{
  requesterCountryCode: string;
  clientCountryCode: string;
  nominalUsdCents: bigint;
  dueAt: Date;
  now: Date;
  paymentPurpose: PaymentPurpose;
}>;

export function validateReceivableTerms(input: ReceivableTerms) {
  if (!paymentPurposes.includes(input.paymentPurpose)) {
    throw new DomainError(
      "Origem do pagamento inválida.",
      "INVALID_PAYMENT_PURPOSE",
    );
  }
  if (input.requesterCountryCode !== "BR") {
    throw new DomainError(
      "O piloto aceita solicitantes do Brasil.",
      "REQUESTER_OUTSIDE_PILOT",
    );
  }
  if (input.clientCountryCode === "BR") {
    throw new DomainError(
      "O piloto exige pagador no exterior.",
      "CLIENT_OUTSIDE_PILOT",
    );
  }
  if (input.nominalUsdCents <= 0n) {
    throw new DomainError("O valor precisa ser positivo.", "INVALID_AMOUNT");
  }

  const days = (input.dueAt.getTime() - input.now.getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    throw new DomainError(
      "O vencimento deve estar entre 1 e 90 dias.",
      "INVALID_DUE_DATE",
    );
  }
}

export function validateEvidenceMetadata(input: EvidenceMetadata) {
  const extension = input.extension.toLowerCase() as keyof typeof allowedEvidenceTypes;
  const expectedType = allowedEvidenceTypes[extension];
  const safeReference = z
    .string()
    .min(8)
    .max(300)
    .regex(/^[a-zA-Z0-9/_-]+$/)
    .safeParse(input.privateObjectReference);

  if (!safeReference.success || input.privateObjectReference.includes("..")) {
    throw new DomainError(
      "Referência privada de documento inválida.",
      "UNSAFE_EVIDENCE_REFERENCE",
    );
  }
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
    throw new DomainError("Hash de evidência inválido.", "INVALID_EVIDENCE_HASH");
  }
  if (
    !expectedType ||
    input.declaredMimeType !== expectedType ||
    input.detectedMimeType !== expectedType
  ) {
    throw new DomainError(
      "Tipo real do documento não corresponde ao formato permitido.",
      "UNSUPPORTED_EVIDENCE_TYPE",
    );
  }
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MAX_EVIDENCE_BYTES) {
    throw new DomainError("Tamanho de documento inválido.", "INVALID_EVIDENCE_SIZE");
  }
}

export type ConfirmationComparison =
  | Readonly<{ outcome: "BTC_REFUSED"; divergences: readonly string[] }>
  | Readonly<{ outcome: "DIVERGED"; divergences: readonly string[] }>
  | Readonly<{ outcome: "ACCEPTED"; divergences: readonly string[] }>;

export function compareClientConfirmation(input: {
  expectedAmountUsdCents: bigint;
  expectedDueAt: Date;
  confirmedAmountUsdCents: bigint;
  confirmedDueAt: Date;
  confirmsDescription: boolean;
  acceptsBtc: boolean;
  termsVersion: string;
}): ConfirmationComparison {
  if (!input.acceptsBtc) {
    return { outcome: "BTC_REFUSED", divergences: ["BTC_NOT_ACCEPTED"] };
  }
  if (input.termsVersion !== RECEIVABLE_TERMS_VERSION) {
    throw new DomainError("Versão dos termos inválida.", "INVALID_TERMS_VERSION");
  }

  const divergences: string[] = [];
  if (!input.confirmsDescription) {
    divergences.push("PAYMENT_DESCRIPTION");
  }
  if (input.confirmedAmountUsdCents !== input.expectedAmountUsdCents) {
    divergences.push("NOMINAL_AMOUNT");
  }
  if (
    input.confirmedDueAt.toISOString().slice(0, 10) !==
    input.expectedDueAt.toISOString().slice(0, 10)
  ) {
    divergences.push("DUE_DATE");
  }
  return divergences.length > 0
    ? { outcome: "DIVERGED", divergences }
    : { outcome: "ACCEPTED", divergences };
}
