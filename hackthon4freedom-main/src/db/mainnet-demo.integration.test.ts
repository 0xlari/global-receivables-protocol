// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  activateMainnetDemo,
  approveMainnetDemo,
  armMainnetDemo,
  createMainnetDemoDraft,
  triggerMainnetCircuitBreaker,
} from "@/db/repositories/mainnet-demo-repository";
import { createMainnetContributionInvoice } from "@/db/repositories/breez-repository";
import * as schema from "@/db/schema";
import { mainnetReadinessAudits } from "@/db/schema";
import { MAINNET_LBTC_ASSET_ID, MAINNET_USDT_ASSET_ID } from "@/integrations/breez/config";
import type { BreezLiquidGateway } from "@/integrations/breez/types";
import { monitorActiveMainnetDemo } from "@/workers/mainnet-demo-monitor";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-14T12:00:00.000Z");
const checklist = { credentialsInSecretVault: true, persistentWorkingDirectories: true, isolatedRestoreVerified: true, reconciliationMatched: true, offlineFallbackReady: true, interruptionOwnerPresent: true } as const;
const enabledConfig = { enabled: true, controlledDemoEnabled: true, apiKey: "fixture", mnemonic: "fixture" } as const;

async function seedAudit(id: string, go: boolean) {
  await database.insert(mainnetReadinessAudits).values({
    id: `audit-${id}`, idempotencyKey: `audit:${id}`, reportHash: "a".repeat(64), status: go ? "GO" : "NO_GO", allChecksPassed: go,
    sdkVersion: "0.12.4", network: "mainnet", lbtcAssetId: MAINNET_LBTC_ASSET_ID, usdtAssetId: MAINNET_USDT_ASSET_ID,
    usdtPrecision: 8, usdcConfigured: false, workingDirPersistent: go, operatorNamed: go, maxSlippageBps: 100,
    externalProbeEnabled: go, externalExecutionAttempted: false, routePrepared: go,
    receiverAmountUnits: go ? 100_000_000n : null, estimatedAssetFeesUnits: go ? 100_000n : null,
    quotePreparedAt: go ? new Date(now.getTime() - 1_000) : null, quoteExpiresAt: go ? new Date(now.getTime() + 30_000) : null,
    walletBtcSats: 500n, refundableCount: 0, unknownPaymentCount: 0, reconciliationMatched: go,
    backupRestoreVerified: go, backupProofHash: go ? "b".repeat(64) : null, checks: [], completedAt: now,
  });
}

async function seedApprovedDraft(id: string, go = true) {
  await seedAudit(id, go);
  await createMainnetDemoDraft(database, { id: `demo-${id}`, readinessAuditId: `audit-${id}`, operatorReference: `operator-${id}`, offlineFallbackReady: true, now });
  await approveMainnetDemo(database, { id: `approval-${id}`, demoRunId: `demo-${id}`, approverReference: `approver-${id}`, checklist, approvedAt: new Date(now.getTime() - 1_000), expiresAt: new Date(now.getTime() + 60_000) });
}

function gateway(snapshot: Partial<Awaited<ReturnType<BreezLiquidGateway["getAuditSnapshot"]>>> = {}): BreezLiquidGateway {
  return {
    createLightningInvoice: async () => { throw new Error("unused"); }, prepareAssetSwap: async () => { throw new Error("unused"); }, executeAssetSwap: async () => { throw new Error("unused"); },
    sync: async () => undefined, listPayments: async () => [], getBalances: async () => ({ btcSats: 500n, assetBalances: {} }), rescanOnchainSwaps: async () => undefined,
    getAuditSnapshot: async () => ({ snapshotHash: "c".repeat(64), fingerprintHash: "d".repeat(64), paymentsDigest: "e".repeat(64), btcSats: 500n, assetBalances: {}, refundableCount: 0, unknownPaymentCount: 0, ...snapshot }),
    subscribe: async () => async () => undefined, backup: () => undefined, restore: () => undefined, disconnect: async () => undefined,
  };
}

describe("demo mainnet controlada", () => {
  beforeAll(async () => { postgres = new PGlite(); database = drizzle(postgres, { schema }); await migrate(database, { migrationsFolder: "drizzle" }); }, 30_000);
  afterAll(async () => postgres.close());

  it("não arma uma demo com auditoria NO_GO", async () => {
    await seedApprovedDraft("no-go", false);
    await expect(armMainnetDemo(database, "demo-no-go", now)).rejects.toMatchObject({ code: "MAINNET_DEMO_NOT_READY" });
  });

  it("arma com GO, mas não ativa sem flag e credenciais", async () => {
    await seedApprovedDraft("pending-access");
    await armMainnetDemo(database, "demo-pending-access", now);
    await expect(activateMainnetDemo(database, { demoRunId: "demo-pending-access", config: { enabled: false, controlledDemoEnabled: false, apiKey: "", mnemonic: "" }, now })).rejects.toMatchObject({ code: "MAINNET_DEMO_ACCESS_PENDING" });
    let gatewayRead = false;
    const guardedGateway = gateway();
    guardedGateway.getBalances = async () => { gatewayRead = true; return { btcSats: 0n, assetBalances: {} }; };
    await expect(createMainnetContributionInvoice(database, guardedGateway, { requestId: "blocked-request-2", intentId: "blocked-intent", sessionId: "demo-pending-access", demoRunId: "demo-pending-access", idempotencyKey: "blocked:invoice:2", description: "Bloqueada", now })).rejects.toMatchObject({ code: "MAINNET_DEMO_NOT_AUTHORIZED" });
    expect(gatewayRead).toBe(false);
  });

  it("recusa uma aprovação expirada", async () => {
    await seedAudit("expired", true);
    await createMainnetDemoDraft(database, { id: "demo-expired", readinessAuditId: "audit-expired", operatorReference: "operator-expired", offlineFallbackReady: true, now });
    await approveMainnetDemo(database, { id: "approval-expired", demoRunId: "demo-expired", approverReference: "approver-expired", checklist, approvedAt: new Date(now.getTime() - 120_000), expiresAt: new Date(now.getTime() - 60_000) });
    await expect(armMainnetDemo(database, "demo-expired", now)).rejects.toMatchObject({ code: "MAINNET_DEMO_APPROVAL_INVALID" });
  });

  it("abre o circuit breaker de forma idempotente e mantém eventos imutáveis", async () => {
    await seedApprovedDraft("breaker");
    await armMainnetDemo(database, "demo-breaker", now);
    await activateMainnetDemo(database, { demoRunId: "demo-breaker", config: enabledConfig, now });
    const input = { id: "breaker-1", demoRunId: "demo-breaker", idempotencyKey: "breaker:fixture", reason: "UNKNOWN_PAYMENT_DETECTED", details: "fixture", now };
    expect((await triggerMainnetCircuitBreaker(database, input)).duplicate).toBe(false);
    expect((await triggerMainnetCircuitBreaker(database, { ...input, id: "breaker-2" })).duplicate).toBe(true);
    const run = await postgres.query<{ status: string }>("select status from mainnet_demo_runs where id = 'demo-breaker'");
    expect(run.rows[0]?.status).toBe("ABORTED");
    await expect(postgres.query("delete from mainnet_circuit_breaker_events where id = 'breaker-1'")).rejects.toThrow("append-only");
  });

  it("monitor interrompe a demo diante de pagamento desconhecido", async () => {
    await seedApprovedDraft("monitor");
    await armMainnetDemo(database, "demo-monitor", now);
    await activateMainnetDemo(database, { demoRunId: "demo-monitor", config: enabledConfig, now });
    const result = await monitorActiveMainnetDemo(database, gateway({ unknownPaymentCount: 1 }), "demo-monitor", now);
    expect(result).toMatchObject({ status: "ABORTED", reason: "UNKNOWN_PAYMENT_DETECTED" });
  });
});
