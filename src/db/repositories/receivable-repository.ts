import { randomUUID } from "node:crypto";

import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import {
  adminReviews,
  auditEvents,
  clientConfirmations,
  consents,
  creditLimitEvents,
  creditLimits,
  identityEvidences,
  outboxEvents,
  receivableEvidences,
  receivableFingerprints,
  receivableVersions,
  receivables,
  reputationFacts,
  users,
  clients,
  validations,
} from "@/db/schema";
import {
  buildConfirmationUrl,
  generateConfirmationToken,
  hashConfirmationToken,
} from "@/domain/confirmation-token";
import { DomainError } from "@/domain/errors";
import {
  compareClientConfirmation,
  type EvidenceMetadata,
  RECEIVABLE_TERMS_VERSION,
  type PaymentPurpose,
  validateEvidenceMetadata,
  validateReceivableTerms,
} from "@/domain/receivable";
import {
  evaluateReceivable,
  RECEIVABLE_RULES_VERSION,
} from "@/domain/receivable-validation";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

function invalidToken(): never {
  throw new DomainError(
    "Link de confirmação inválido, expirado ou já utilizado.",
    "INVALID_OR_EXPIRED_CONFIRMATION",
  );
}

function tokenHashOrInvalid(rawToken: string) {
  try {
    return hashConfirmationToken(rawToken);
  } catch {
    return invalidToken();
  }
}

export type ReceivableSubmissionInput = Readonly<{
  requesterId: string;
  clientId: string;
  paymentDescription: string;
  paymentPurpose: PaymentPurpose;
  nominalUsdCents: bigint;
  dueAt: Date;
  evidence: EvidenceMetadata;
  now: Date;
  confirmationExpiresAt: Date;
  confirmationBaseUrl: string;
  tokenFactory?: () => string;
  receivableIdFactory?: () => string;
}>;

export async function submitReceivableWithinTransaction<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: ReceivableSubmissionInput,
) {
  validateEvidenceMetadata(input.evidence);
  const description = input.paymentDescription.trim();
  if (description.length < 3 || description.length > 160 || /[<>]/.test(description)) {
    throw new DomainError("Descrição do pagamento inválida.", "INVALID_PAYMENT_DESCRIPTION");
  }
  if (input.confirmationExpiresAt <= input.now) {
    throw new DomainError("Expiração do link inválida.", "INVALID_CONFIRMATION_EXPIRY");
  }

  const rawToken = (input.tokenFactory ?? generateConfirmationToken)();
  const tokenHash = tokenHashOrInvalid(rawToken);
  const receivableId = (input.receivableIdFactory ?? randomUUID)();

  const [requester] = await db.select().from(users).where(eq(users.id, input.requesterId)).limit(1);
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
    if (!requester || !client) {
      throw new DomainError("Participantes não encontrados.", "PARTICIPANT_NOT_FOUND");
    }
    validateReceivableTerms({ requesterCountryCode: requester.countryCode, clientCountryCode: client.countryCode, nominalUsdCents: input.nominalUsdCents, dueAt: input.dueAt, now: input.now, paymentPurpose: input.paymentPurpose });

    await db.insert(receivables).values({
      id: receivableId,
      requesterId: input.requesterId,
      clientId: input.clientId,
      nominalAmount: input.nominalUsdCents,
      dueAt: input.dueAt,
      evidenceHash: input.evidence.sha256,
      status: "DRAFT",
    });
    await db.insert(receivableVersions).values({ id: randomUUID(), receivableId, version: 1, paymentDescription: description, paymentPurpose: input.paymentPurpose, nominalAmount: input.nominalUsdCents, dueAt: input.dueAt });
    await db.insert(receivableEvidences).values({
      id: randomUUID(), receivableId, receivableVersion: 1,
      privateObjectReference: input.evidence.privateObjectReference,
      sha256: input.evidence.sha256, extension: input.evidence.extension,
      declaredMimeType: input.evidence.declaredMimeType,
      detectedMimeType: input.evidence.detectedMimeType,
      byteSize: input.evidence.byteSize, scanStatus: input.evidence.scanStatus,
      scannedAt: input.evidence.scanStatus === "CLEAN" ? input.now : null,
    });
    await db.insert(clientConfirmations).values({ id: randomUUID(), receivableId, receivableVersion: 1, tokenHash, expiresAt: input.confirmationExpiresAt });
    await db.update(receivables).set({ status: "AWAITING_CLIENT", updatedAt: input.now }).where(eq(receivables.id, receivableId));
    await db.insert(auditEvents).values({ id: randomUUID(), actorId: input.requesterId, action: "RECEIVABLE_SUBMITTED", targetType: "RECEIVABLE", targetId: receivableId, correlationId: randomUUID(), after: { version: 1 } });

  return { receivableId, confirmationUrl: buildConfirmationUrl(input.confirmationBaseUrl, rawToken), rawToken };
}

export async function submitReceivable<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: ReceivableSubmissionInput,
) {
  return db.transaction((tx) => submitReceivableWithinTransaction(tx, input));
}

async function findConfirmation<THKT extends PgQueryResultHKT>(db: Database<THKT>, rawToken: string) {
  const tokenHash = tokenHashOrInvalid(rawToken);
  const [row] = await db
    .select({
      confirmation: clientConfirmations,
      version: receivableVersions,
    })
    .from(clientConfirmations)
    .innerJoin(
      receivableVersions,
      and(
        eq(receivableVersions.receivableId, clientConfirmations.receivableId),
        eq(receivableVersions.version, clientConfirmations.receivableVersion),
      ),
    )
    .where(eq(clientConfirmations.tokenHash, tokenHash))
    .limit(1);
  return row ?? invalidToken();
}

export async function inspectClientConfirmation<THKT extends PgQueryResultHKT>(
  db: Database<THKT>, rawToken: string, now: Date,
) {
  const row = await findConfirmation(db, rawToken);
  if (row.confirmation.status !== "PENDING" || row.confirmation.expiresAt <= now) invalidToken();
  return {
    paymentDescription: row.version.paymentDescription,
    paymentPurpose: row.version.paymentPurpose,
    nominalUsdCents: row.version.nominalAmount,
    dueAt: row.version.dueAt,
    termsVersion: RECEIVABLE_TERMS_VERSION,
  };
}

export async function reviseReceivable<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: {
    receivableId: string;
    requesterId: string;
    paymentDescription: string;
    paymentPurpose: PaymentPurpose;
    nominalUsdCents: bigint;
    dueAt: Date;
    evidence: EvidenceMetadata;
    now: Date;
    confirmationExpiresAt: Date;
    confirmationBaseUrl: string;
    tokenFactory?: () => string;
  },
) {
  validateEvidenceMetadata(input.evidence);
  const description = input.paymentDescription.trim();
  if (description.length < 3 || description.length > 160 || /[<>]/.test(description)) {
    throw new DomainError("Descrição do pagamento inválida.", "INVALID_PAYMENT_DESCRIPTION");
  }
  const rawToken = (input.tokenFactory ?? generateConfirmationToken)();
  const tokenHash = tokenHashOrInvalid(rawToken);
  const version = await db.transaction(async (tx) => {
    const [receivable] = await tx.select().from(receivables).where(eq(receivables.id, input.receivableId)).for("update");
    if (!receivable || receivable.requesterId !== input.requesterId || receivable.status !== "NEEDS_CORRECTION") {
      throw new DomainError("Recebível não pode ser corrigido.", "INVALID_RECEIVABLE_STATE");
    }
    const [requester] = await tx.select().from(users).where(eq(users.id, receivable.requesterId));
    const [client] = await tx.select().from(clients).where(eq(clients.id, receivable.clientId));
    if (!requester || !client) throw new DomainError("Participantes não encontrados.", "PARTICIPANT_NOT_FOUND");
    validateReceivableTerms({ requesterCountryCode: requester.countryCode, clientCountryCode: client.countryCode, nominalUsdCents: input.nominalUsdCents, dueAt: input.dueAt, now: input.now, paymentPurpose: input.paymentPurpose });
    const nextVersion = receivable.version + 1;
    await tx.insert(receivableVersions).values({ id: randomUUID(), receivableId: receivable.id, version: nextVersion, paymentDescription: description, paymentPurpose: input.paymentPurpose, nominalAmount: input.nominalUsdCents, dueAt: input.dueAt });
    await tx.insert(receivableEvidences).values({ id: randomUUID(), receivableId: receivable.id, receivableVersion: nextVersion, privateObjectReference: input.evidence.privateObjectReference, sha256: input.evidence.sha256, extension: input.evidence.extension, declaredMimeType: input.evidence.declaredMimeType, detectedMimeType: input.evidence.detectedMimeType, byteSize: input.evidence.byteSize, scanStatus: input.evidence.scanStatus, scannedAt: input.evidence.scanStatus === "CLEAN" ? input.now : null });
    await tx.insert(clientConfirmations).values({ id: randomUUID(), receivableId: receivable.id, receivableVersion: nextVersion, tokenHash, expiresAt: input.confirmationExpiresAt });
    await tx.update(receivables).set({ version: nextVersion, nominalAmount: input.nominalUsdCents, dueAt: input.dueAt, evidenceHash: input.evidence.sha256, clientAcceptedBtc: null, status: "AWAITING_CLIENT", updatedAt: input.now }).where(eq(receivables.id, receivable.id));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorId: input.requesterId, action: "RECEIVABLE_REVISED", targetType: "RECEIVABLE", targetId: receivable.id, correlationId: randomUUID(), before: { version: receivable.version }, after: { version: nextVersion } });
    return nextVersion;
  });
  return { version, rawToken, confirmationUrl: buildConfirmationUrl(input.confirmationBaseUrl, rawToken) };
}

export async function confirmReceivable<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { rawToken: string; acceptsBtc: boolean; confirmsDescription: boolean; confirmedAmountUsdCents: bigint; confirmedDueAt: Date; termsVersion: string; now: Date },
) {
  const tokenHash = tokenHashOrInvalid(input.rawToken);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ confirmation: clientConfirmations, version: receivableVersions })
      .from(clientConfirmations)
      .innerJoin(receivableVersions, and(eq(receivableVersions.receivableId, clientConfirmations.receivableId), eq(receivableVersions.version, clientConfirmations.receivableVersion)))
      .where(eq(clientConfirmations.tokenHash, tokenHash))
      .for("update");
    if (!row || row.confirmation.status !== "PENDING" || row.confirmation.expiresAt <= input.now) invalidToken();

    const comparison = compareClientConfirmation({
      expectedAmountUsdCents: row.version.nominalAmount,
      expectedDueAt: row.version.dueAt,
      confirmedAmountUsdCents: input.confirmedAmountUsdCents,
      confirmedDueAt: input.confirmedDueAt,
      confirmsDescription: input.confirmsDescription,
      acceptsBtc: input.acceptsBtc,
      termsVersion: input.termsVersion,
    });
    const status = comparison.outcome === "ACCEPTED" ? "ACCEPTED" : comparison.outcome;
    await tx.update(clientConfirmations).set({ status, usedAt: input.now, clientAcceptsBtc: input.acceptsBtc, confirmsDescription: input.confirmsDescription, confirmedAmount: input.confirmedAmountUsdCents, confirmedDueAt: input.confirmedDueAt, termsVersion: input.termsVersion, divergences: comparison.divergences }).where(eq(clientConfirmations.id, row.confirmation.id));

    if (comparison.outcome === "BTC_REFUSED") {
      await tx.update(receivables).set({ status: "REJECTED", clientAcceptedBtc: false, updatedAt: input.now }).where(eq(receivables.id, row.confirmation.receivableId));
    } else if (comparison.outcome === "DIVERGED") {
      await tx.update(receivables).set({ status: "UNDER_VALIDATION", clientAcceptedBtc: true, updatedAt: input.now }).where(eq(receivables.id, row.confirmation.receivableId));
      await tx.update(receivables).set({ status: "NEEDS_CORRECTION", updatedAt: input.now }).where(eq(receivables.id, row.confirmation.receivableId));
    } else {
      await tx.update(receivables).set({ status: "UNDER_VALIDATION", clientAcceptedBtc: true, updatedAt: input.now }).where(eq(receivables.id, row.confirmation.receivableId));
      await tx.insert(outboxEvents).values({ id: randomUUID(), topic: "receivable.validation.requested", aggregateType: "RECEIVABLE", aggregateId: row.confirmation.receivableId, payload: { receivableVersion: row.confirmation.receivableVersion } });
    }
    await tx.insert(auditEvents).values({ id: randomUUID(), action: "CLIENT_CONFIRMATION_RECORDED", targetType: "RECEIVABLE", targetId: row.confirmation.receivableId, correlationId: randomUUID(), after: { outcome: comparison.outcome, version: row.confirmation.receivableVersion } });
    return { receivableId: row.confirmation.receivableId, outcome: comparison.outcome, divergences: comparison.divergences };
  });
}

export async function validateReceivableAutomatically<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { receivableId: string; now: Date; correlationId: string },
) {
  return db.transaction(async (tx) => {
    const [receivable] = await tx.select().from(receivables).where(eq(receivables.id, input.receivableId)).for("update");
    if (!receivable || receivable.status !== "UNDER_VALIDATION") {
      throw new DomainError("Recebível não aguarda validação.", "INVALID_RECEIVABLE_STATE");
    }
    const [requester] = await tx.select().from(users).where(eq(users.id, receivable.requesterId));
    const [client] = await tx.select().from(clients).where(eq(clients.id, receivable.clientId));
    const [evidence] = await tx.select().from(receivableEvidences).where(and(eq(receivableEvidences.receivableId, receivable.id), eq(receivableEvidences.receivableVersion, receivable.version)));
    const [confirmation] = await tx.select().from(clientConfirmations).where(and(eq(clientConfirmations.receivableId, receivable.id), eq(clientConfirmations.receivableVersion, receivable.version), eq(clientConfirmations.status, "ACCEPTED")));
    const identityRows = await tx.select().from(identityEvidences).where(and(eq(identityEvidences.userId, receivable.requesterId), eq(identityEvidences.type, "IDENTITY"), eq(identityEvidences.status, "VERIFIED"), or(isNull(identityEvidences.expiresAt), gt(identityEvidences.expiresAt, input.now))));
    const consentRows = await tx.select().from(consents).where(and(eq(consents.userId, receivable.requesterId), eq(consents.type, "IDENTITY_PROCESSING"), isNull(consents.revokedAt)));
    const [limit] = await tx.select().from(creditLimits).where(eq(creditLimits.userId, receivable.requesterId)).for("update");
    const [duplicate] = evidence ? await tx.select().from(receivableFingerprints).where(eq(receivableFingerprints.sha256, evidence.sha256)) : [];
    const [clientDefault] = await tx.select().from(reputationFacts).where(and(eq(reputationFacts.subjectType, "CLIENT"), eq(reputationFacts.subjectId, receivable.clientId), eq(reputationFacts.type, "CLIENT_DEFAULTED"), eq(reputationFacts.status, "ACTIVE"), or(isNull(reputationFacts.expiresAt), gt(reputationFacts.expiresAt, input.now))));

    const decision = evaluateReceivable({
      requesterCountryCode: requester?.countryCode ?? "",
      clientCountryCode: client?.countryCode ?? "BR",
      identityVerified: identityRows.length > 0,
      identityConsentActive: consentRows.length > 0,
      evidenceClean: evidence?.scanStatus === "CLEAN",
      clientAcceptedBtc: confirmation?.clientAcceptsBtc === true,
      confirmationMatches: confirmation?.status === "ACCEPTED",
      duplicateEvidence: Boolean(duplicate && duplicate.receivableId !== receivable.id),
      clientHasDefault: Boolean(clientDefault),
      availableLimitUsdCents: limit ? limit.totalAmount - limit.usedAmount : 0n,
      nominalUsdCents: receivable.nominalAmount,
    });
    const validationId = randomUUID();
    await tx.insert(validations).values({ id: validationId, receivableId: receivable.id, receivableVersion: receivable.version, status: "PENDING", rulesVersion: RECEIVABLE_RULES_VERSION, results: decision.results });
    await tx.update(validations).set({ status: "RUNNING", updatedAt: input.now }).where(eq(validations.id, validationId));

    let outcome = decision.outcome;
    let reason = decision.reason;
    if (outcome === "PASSED" && evidence && limit) {
      const claimed = await tx.insert(receivableFingerprints).values({ sha256: evidence.sha256, receivableId: receivable.id, claimedAt: input.now }).onConflictDoNothing().returning({ receivableId: receivableFingerprints.receivableId });
      if (claimed.length === 0) {
        outcome = "FAILED";
        reason = "duplicate";
      } else {
        const newUsed = limit.usedAmount + receivable.nominalAmount;
        if (newUsed > limit.totalAmount) {
          outcome = "FAILED";
          reason = "credit_limit";
        } else {
          await tx.update(creditLimits).set({ usedAmount: newUsed, version: limit.version + 1, updatedAt: input.now }).where(eq(creditLimits.userId, limit.userId));
          await tx.insert(creditLimitEvents).values({ id: randomUUID(), userId: limit.userId, idempotencyKey: `receivable:${receivable.id}:reserve`, ruleVersion: limit.ruleVersion, reason: "RECEIVABLE_APPROVED", previousTotalAmount: limit.totalAmount, newTotalAmount: limit.totalAmount, previousUsedAmount: limit.usedAmount, newUsedAmount: newUsed, breakdown: limit.breakdown, correlationId: input.correlationId });
        }
      }
    }

    await tx.update(validations).set({ status: outcome, decisionReason: reason, updatedAt: input.now }).where(eq(validations.id, validationId));
    if (outcome === "PASSED") await tx.update(receivables).set({ status: "APPROVED", updatedAt: input.now }).where(eq(receivables.id, receivable.id));
    if (outcome === "FAILED") await tx.update(receivables).set({ status: "REJECTED", updatedAt: input.now }).where(eq(receivables.id, receivable.id));
    await tx.insert(auditEvents).values({ id: randomUUID(), action: "AUTOMATIC_VALIDATION_DECIDED", targetType: "RECEIVABLE", targetId: receivable.id, correlationId: input.correlationId, after: { outcome, reason, rulesVersion: RECEIVABLE_RULES_VERSION } });
    return { validationId, outcome, reason };
  });
}

export async function reviewValidationException<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { validationId: string; reviewerId: string; decision: "PASSED" | "FAILED"; reason: string; correlationId: string; now: Date },
) {
  if (input.reason.trim().length < 10) throw new DomainError("Justificativa administrativa insuficiente.", "REVIEW_REASON_REQUIRED");
  return db.transaction(async (tx) => {
    const [validation] = await tx.select().from(validations).where(eq(validations.id, input.validationId)).for("update");
    if (!validation || validation.status !== "NEEDS_REVIEW") throw new DomainError("Validação não aguarda revisão.", "INVALID_VALIDATION_STATE");
    const [receivable] = await tx.select().from(receivables).where(eq(receivables.id, validation.receivableId)).for("update");
    if (!receivable || receivable.status !== "UNDER_VALIDATION") throw new DomainError("Recebível não aguarda revisão.", "INVALID_RECEIVABLE_STATE");
    if (input.decision === "PASSED") {
      const [evidence] = await tx.select().from(receivableEvidences).where(and(eq(receivableEvidences.receivableId, receivable.id), eq(receivableEvidences.receivableVersion, validation.receivableVersion)));
      const [limit] = await tx.select().from(creditLimits).where(eq(creditLimits.userId, receivable.requesterId)).for("update");
      if (!evidence || !limit || limit.usedAmount + receivable.nominalAmount > limit.totalAmount) {
        throw new DomainError("Limite ou evidência indisponível para aprovação.", "REVIEW_APPROVAL_BLOCKED");
      }
      const claimed = await tx.insert(receivableFingerprints).values({ sha256: evidence.sha256, receivableId: receivable.id, claimedAt: input.now }).onConflictDoNothing().returning({ id: receivableFingerprints.receivableId });
      if (claimed.length === 0) throw new DomainError("Evidência já usada por outro recebível.", "DUPLICATE_RECEIVABLE");
      const newUsed = limit.usedAmount + receivable.nominalAmount;
      await tx.update(creditLimits).set({ usedAmount: newUsed, version: limit.version + 1, updatedAt: input.now }).where(eq(creditLimits.userId, limit.userId));
      await tx.insert(creditLimitEvents).values({ id: randomUUID(), userId: limit.userId, idempotencyKey: `receivable:${receivable.id}:reserve`, ruleVersion: limit.ruleVersion, reason: "RECEIVABLE_APPROVED_BY_EXCEPTION", previousTotalAmount: limit.totalAmount, newTotalAmount: limit.totalAmount, previousUsedAmount: limit.usedAmount, newUsedAmount: newUsed, breakdown: limit.breakdown, correlationId: input.correlationId });
    }
    await tx.insert(adminReviews).values({ id: randomUUID(), validationId: validation.id, reviewerId: input.reviewerId, decision: input.decision, reason: input.reason.trim(), correlationId: input.correlationId });
    await tx.update(validations).set({ status: input.decision, reviewedBy: input.reviewerId, decisionReason: input.reason.trim(), updatedAt: input.now }).where(eq(validations.id, validation.id));
    await tx.update(receivables).set({ status: input.decision === "PASSED" ? "APPROVED" : "REJECTED", updatedAt: input.now }).where(eq(receivables.id, validation.receivableId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorId: input.reviewerId, action: "EXCEPTIONAL_VALIDATION_REVIEW", targetType: "VALIDATION", targetId: validation.id, correlationId: input.correlationId, after: { decision: input.decision, reason: input.reason.trim() } });
    return { receivableId: validation.receivableId, decision: input.decision };
  });
}
