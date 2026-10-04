import { describe, expect, it } from "vitest";
import { nextNwcSchedulerAction } from ".";

describe("LRP v0.1 NWC scheduler", () => {
  const dueAt = 1_000_000;
  it("tenta no vencimento, após 1h e pela última vez após 24h", () => { expect(nextNwcSchedulerAction({ dueAt, attempts: [] }, dueAt).type).toBe("ATTEMPT"); expect(nextNwcSchedulerAction({ dueAt, attempts: [dueAt] }, dueAt + 3600).type).toBe("ATTEMPT"); expect(nextNwcSchedulerAction({ dueAt, attempts: [dueAt, dueAt + 3600] }, dueAt + 86400).type).toBe("ATTEMPT"); });
  it("UNKNOWN bloqueia retry até reconciliação", () => { expect(nextNwcSchedulerAction({ dueAt, attempts: [dueAt], lastResult: "UNKNOWN" }, dueAt + 100_000)).toEqual({ type: "WAIT", reason: "UNKNOWN_REQUIRES_RECONCILIATION" }); });
  it("marca atraso em 48h e default em 7 dias", () => { expect(nextNwcSchedulerAction({ dueAt, attempts: [dueAt, dueAt+3600, dueAt+86400] }, dueAt + 48*3600).type).toBe("OVERDUE"); expect(nextNwcSchedulerAction({ dueAt, attempts: [] }, dueAt + 7*86400).type).toBe("DEFAULTED"); });
});
