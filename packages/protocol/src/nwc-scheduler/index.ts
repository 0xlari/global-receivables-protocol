export type SchedulerResult = "SUCCESS" | "TEMPORARY_FAILURE" | "DEFINITIVE_FAILURE" | "UNKNOWN";
export type SchedulerState = Readonly<{ dueAt: number; attempts: readonly number[]; lastResult?: SchedulerResult; reconciled?: boolean }>;
export type SchedulerAction = Readonly<{ type: "WAIT" | "ATTEMPT" | "MANUAL_FALLBACK" | "OVERDUE" | "DEFAULTED"; at?: number; reason?: string }>;
export interface NwcSchedulerAdapter { schedule(input: { authorizationId: string; at: number }): Promise<void>; cancel(authorizationId: string): Promise<void>; }
export class FakeNwcSchedulerAdapter implements NwcSchedulerAdapter { readonly jobs = new Map<string, number>(); async schedule(input: { authorizationId: string; at: number }) { this.jobs.set(input.authorizationId, input.at); } async cancel(id: string) { this.jobs.delete(id); } }

export function nextNwcSchedulerAction(state: SchedulerState, now: number): SchedulerAction {
  if (state.lastResult === "SUCCESS") return { type: "WAIT", reason: "SETTLED" };
  if (state.lastResult === "UNKNOWN" && !state.reconciled) return { type: "WAIT", reason: "UNKNOWN_REQUIRES_RECONCILIATION" };
  if (now >= state.dueAt + 7 * 86_400) return { type: "DEFAULTED" };
  if (now >= state.dueAt + 48 * 3_600) return { type: "OVERDUE" };
  if (state.lastResult === "DEFINITIVE_FAILURE") return { type: "MANUAL_FALLBACK" };
  const count = state.attempts.length;
  if (count === 0) return now >= state.dueAt ? { type: "ATTEMPT", at: state.dueAt } : { type: "WAIT", at: state.dueAt };
  if (count === 1) { const at = state.attempts[0]! + 3_600; return now >= at ? { type: "ATTEMPT", at } : { type: "WAIT", at }; }
  if (count === 2) { const at = state.attempts[0]! + 86_400; return now >= at ? { type: "ATTEMPT", at } : { type: "WAIT", at }; }
  return { type: "MANUAL_FALLBACK", reason: "RETRIES_EXHAUSTED" };
}
