import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import { mainnetCircuitBreakerEvents, mainnetDemoApprovals, mainnetDemoRuns, mainnetReadinessAudits, mainnetSessions } from "@/db/schema";
import { DomainError } from "@/domain/errors";
import type { BreezMainnetConfig } from "@/integrations/breez/config";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export type DemoActivationChecklist = Readonly<{
  credentialsInSecretVault: boolean;
  persistentWorkingDirectories: boolean;
  isolatedRestoreVerified: boolean;
  reconciliationMatched: boolean;
  offlineFallbackReady: boolean;
  interruptionOwnerPresent: boolean;
}>;

export async function createMainnetDemoDraft<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: { id: string; readinessAuditId: string; operatorReference: string; offlineFallbackReady: boolean; now: Date }) {
  if (input.operatorReference.length < 8) throw new DomainError("Referência do operador inválida.", "MAINNET_OPERATOR_REQUIRED");
  return db.transaction(async (tx) => {
    const [audit] = await tx.select().from(mainnetReadinessAudits).where(eq(mainnetReadinessAudits.id, input.readinessAuditId)).limit(1);
    if (!audit) throw new DomainError("Auditoria mainnet não encontrada.", "MAINNET_READINESS_NOT_FOUND");
    await tx.insert(mainnetSessions).values({ id: input.id, requestedAmountSats: 0n, maxAmountSats: 5_000n });
    await tx.insert(mainnetDemoRuns).values({ id: input.id, readinessAuditId: input.readinessAuditId, operatorRefHash: hash(input.operatorReference), offlineFallbackReady: input.offlineFallbackReady, status: "DRAFT", updatedAt: input.now });
    return { demoRunId: input.id, status: "DRAFT" as const, readinessStatus: audit.status };
  });
}

export async function approveMainnetDemo<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: { id: string; demoRunId: string; approverReference: string; checklist: DemoActivationChecklist; approvedAt: Date; expiresAt: Date }) {
  if (input.approverReference.length < 8 || !Object.values(input.checklist).every(Boolean)) throw new DomainError("Checklist ou aprovador incompleto.", "MAINNET_DEMO_CHECKLIST_INCOMPLETE");
  const [run] = await db.select().from(mainnetDemoRuns).where(eq(mainnetDemoRuns.id, input.demoRunId)).limit(1);
  if (!run || run.status !== "DRAFT") throw new DomainError("Sessão não aceita aprovação.", "MAINNET_DEMO_NOT_DRAFT");
  await db.insert(mainnetDemoApprovals).values({ id: input.id, demoRunId: input.demoRunId, approverRefHash: hash(input.approverReference), checklistHash: hash(JSON.stringify(input.checklist)), approvedAt: input.approvedAt, expiresAt: input.expiresAt });
  return { approvalId: input.id };
}

export async function revokeMainnetDemoApproval<THKT extends PgQueryResultHKT>(db: Database<THKT>, demoRunId: string, now: Date) {
  const updated = await db.update(mainnetDemoApprovals).set({ revokedAt: now }).where(and(eq(mainnetDemoApprovals.demoRunId, demoRunId), isNull(mainnetDemoApprovals.revokedAt))).returning({ id: mainnetDemoApprovals.id });
  if (updated.length !== 1) throw new DomainError("Aprovação não está ativa.", "MAINNET_DEMO_APPROVAL_NOT_ACTIVE");
}

export async function armMainnetDemo<THKT extends PgQueryResultHKT>(db: Database<THKT>, demoRunId: string, now: Date) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ run: mainnetDemoRuns, audit: mainnetReadinessAudits, approval: mainnetDemoApprovals }).from(mainnetDemoRuns).innerJoin(mainnetReadinessAudits, eq(mainnetReadinessAudits.id, mainnetDemoRuns.readinessAuditId)).innerJoin(mainnetDemoApprovals, eq(mainnetDemoApprovals.demoRunId, mainnetDemoRuns.id)).where(eq(mainnetDemoRuns.id, demoRunId)).for("update");
    if (!row || row.run.status !== "DRAFT" || row.audit.status !== "GO" || !row.audit.allChecksPassed) throw new DomainError("Auditoria GO é obrigatória para armar a demo.", "MAINNET_DEMO_NOT_READY");
    if (!row.run.offlineFallbackReady || !row.approval || row.approval.revokedAt || row.approval.approvedAt > now || row.approval.expiresAt <= now) throw new DomainError("Aprovação vigente e fallback são obrigatórios.", "MAINNET_DEMO_APPROVAL_INVALID");
    const [updated] = await tx.update(mainnetDemoRuns).set({ status: "ARMED", armedAt: now, updatedAt: now }).where(and(eq(mainnetDemoRuns.id, demoRunId), eq(mainnetDemoRuns.status, "DRAFT"))).returning({ id: mainnetDemoRuns.id });
    if (!updated) throw new DomainError("Estado da demo mudou durante a aprovação.", "MAINNET_DEMO_STATE_CONFLICT");
    return { demoRunId, status: "ARMED" as const };
  });
}

export async function activateMainnetDemo<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: { demoRunId: string; config: Pick<BreezMainnetConfig, "enabled" | "controlledDemoEnabled" | "apiKey" | "mnemonic">; now: Date }) {
  if (!input.config.enabled || !input.config.controlledDemoEnabled || !input.config.apiKey || !input.config.mnemonic) throw new DomainError("Flags e credenciais ainda não estão configuradas.", "MAINNET_DEMO_ACCESS_PENDING");
  const [updated] = await db.update(mainnetDemoRuns).set({ status: "ACTIVE", activatedAt: input.now, updatedAt: input.now }).where(and(eq(mainnetDemoRuns.id, input.demoRunId), eq(mainnetDemoRuns.status, "ARMED"))).returning({ id: mainnetDemoRuns.id });
  if (!updated) throw new DomainError("Demo não está armada.", "MAINNET_DEMO_NOT_ARMED");
  return { demoRunId: input.demoRunId, status: "ACTIVE" as const };
}

export async function triggerMainnetCircuitBreaker<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: { id: string; demoRunId: string; idempotencyKey: string; reason: string; details: string; now: Date }) {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(mainnetCircuitBreakerEvents).values({ id: input.id, demoRunId: input.demoRunId, idempotencyKey: input.idempotencyKey, reason: input.reason, detailsHash: hash(input.details), triggeredAt: input.now }).onConflictDoNothing({ target: mainnetCircuitBreakerEvents.idempotencyKey }).returning({ id: mainnetCircuitBreakerEvents.id });
    if (inserted.length === 0) return { demoRunId: input.demoRunId, duplicate: true };
    await tx.update(mainnetDemoRuns).set({ status: "ABORTED", stoppedAt: input.now, stopReason: input.reason, updatedAt: input.now }).where(and(eq(mainnetDemoRuns.id, input.demoRunId), inArray(mainnetDemoRuns.status, ["ARMED", "ACTIVE"])));
    return { demoRunId: input.demoRunId, duplicate: false };
  });
}

export async function finishMainnetDemo<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: { demoRunId: string; completed: boolean; reason: string; now: Date }) {
  const target = input.completed ? "COMPLETED" as const : "STOPPED" as const;
  const [updated] = await db.update(mainnetDemoRuns).set({ status: target, stoppedAt: input.now, stopReason: input.reason, updatedAt: input.now }).where(and(eq(mainnetDemoRuns.id, input.demoRunId), eq(mainnetDemoRuns.status, "ACTIVE"))).returning({ id: mainnetDemoRuns.id });
  if (!updated) throw new DomainError("Demo não está ativa.", "MAINNET_DEMO_NOT_ACTIVE");
  return { demoRunId: input.demoRunId, status: target };
}
