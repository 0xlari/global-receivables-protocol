// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createMainnetContributionInvoice,
  executeMainnetAssetSwap,
  prepareMainnetAssetSwap,
  processMainnetPaymentEvent,
  reconcileMainnetWallet,
} from "@/db/repositories/breez-repository";
import { recordBreezReadinessAudit } from "@/db/repositories/breez-readiness-repository";
import { activateMainnetDemo, approveMainnetDemo, armMainnetDemo, createMainnetDemoDraft } from "@/db/repositories/mainnet-demo-repository";
import * as schema from "@/db/schema";
import { evaluateBreezReadiness } from "@/domain/breez-readiness";
import { MAINNET_LBTC_ASSET_ID, MAINNET_USDT_ASSET_ID } from "@/integrations/breez/config";
import type { BreezLiquidGateway, BreezPaymentEvent, PreparedAssetSwap } from "@/integrations/breez/types";
import { runBreezMainnetPollingCycle } from "@/workers/breez-mainnet-worker";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-14T12:00:00.000Z");

function gateway(overrides: Partial<BreezLiquidGateway> = {}): BreezLiquidGateway {
  return {
    createLightningInvoice: async ({ amountSats }) => ({ invoice: "lnbc-mainnet-fixture", paymentHash: "a".repeat(64), amountSats, feesSats: 10n, expiresAt: new Date(now.getTime() + 30_000) }),
    prepareAssetSwap: async (input) => ({ ...input, feesSats: 5n, estimatedAssetFeesUnits: 10n, preparedAt: now, expiresAt: new Date(now.getTime() + 60_000), opaquePrepareResponse: {} }),
    executeAssetSwap: async () => ({ externalReference: "swap-mainnet-reference", state: "PENDING" }),
    sync: async () => undefined,
    listPayments: async () => [],
    getBalances: async () => ({ btcSats: 500n, assetBalances: { [MAINNET_USDT_ASSET_ID]: 0n } }),
    rescanOnchainSwaps: async () => undefined,
    getAuditSnapshot: async () => ({ snapshotHash: "a".repeat(64), fingerprintHash: "b".repeat(64), paymentsDigest: "c".repeat(64), btcSats: 500n, assetBalances: { [MAINNET_USDT_ASSET_ID]: 0n }, refundableCount: 0, unknownPaymentCount: 0 }),
    subscribe: async () => async () => undefined,
    backup: () => undefined,
    restore: () => undefined,
    disconnect: async () => undefined,
    ...overrides,
  };
}

async function seedMainnetIntent(id: string, amount = 500n) {
  await postgres.query("insert into users (id, country_code, status) values ($1, 'BR', 'ACTIVE')", [`requester-${id}`]);
  await postgres.query("insert into users (id, country_code, status) values ($1, 'BR', 'ACTIVE')", [`contributor-${id}`]);
  await postgres.query("insert into clients (id, country_code) values ($1, 'US')", [`payer-${id}`]);
  await postgres.query("insert into receivables (id, requester_id, client_id, nominal_amount, due_at, status, client_accepted_btc) values ($1, $2, $3, 200000, $4, 'APPROVED', true)", [`receivable-${id}`, `requester-${id}`, `payer-${id}`, new Date("2026-08-13T12:00:00.000Z")]);
  await postgres.query("insert into pools (id, receivable_id, mode, risk_band, environment, funding_asset, settlement_asset, nominal_usd_cents, advance_usd_cents, discount_bps, target_amount, funded_amount, reserved_amount, closes_at, status) values ($1, $2, 'FULL_BTC', 'LOW', 'MAINNET', 'BTC', 'BTC', 200000, 194000, 300, 1000, 0, $3, $4, 'OPEN')", [`pool-${id}`, `receivable-${id}`, amount.toString(), new Date(now.getTime() + 60_000)]);
  await postgres.query("insert into contribution_intents (id, pool_id, contributor_id, amount, asset, status, capacity_reserved, expires_at) values ($1, $2, $3, $4, 'BTC', 'CREATED', true, $5)", [`intent-${id}`, `pool-${id}`, `contributor-${id}`, amount.toString(), new Date(now.getTime() + 60_000)]);
  const evidence = {
    sdkVersion: "0.12.4", network: "mainnet", lbtcAssetId: MAINNET_LBTC_ASSET_ID, usdtAssetId: MAINNET_USDT_ASSET_ID,
    usdtPrecision: 8, usdcConfigured: false, workingDirPersistent: true, operatorNamed: true,
    externalProbeEnabled: true, externalExecutionAttempted: false, routePrepared: true,
    routeFromAssetId: MAINNET_LBTC_ASSET_ID, routeToAssetId: MAINNET_USDT_ASSET_ID,
    receiverAmountUnits: 100_000_000n, estimatedAssetFeesUnits: 100_000n, maxSlippageBps: 100,
    quotePreparedAt: new Date(now.getTime() - 1_000), quoteExpiresAt: new Date(now.getTime() + 30_000),
    walletBtcSats: 500n, refundableCount: 0, unknownPaymentCount: 0, reconciliationMatched: true,
    backup: { attempted: true, verified: true, proofHash: "d".repeat(64), sourceSnapshotHash: "e".repeat(64), restoredSnapshotHash: "e".repeat(64) },
  } as const;
  await recordBreezReadinessAudit(database, { id: `audit-${id}`, idempotencyKey: `audit:${id}`, evidence, decision: evaluateBreezReadiness(evidence, now), completedAt: now });
  await createMainnetDemoDraft(database, { id: `session-${id}`, readinessAuditId: `audit-${id}`, operatorReference: `operator-${id}`, offlineFallbackReady: true, now });
  const checklist = { credentialsInSecretVault: true, persistentWorkingDirectories: true, isolatedRestoreVerified: true, reconciliationMatched: true, offlineFallbackReady: true, interruptionOwnerPresent: true } as const;
  await approveMainnetDemo(database, { id: `approval-${id}`, demoRunId: `session-${id}`, approverReference: `approver-${id}`, checklist, approvedAt: new Date(now.getTime() - 1_000), expiresAt: new Date(now.getTime() + 60_000) });
  await armMainnetDemo(database, `session-${id}`, now);
  await activateMainnetDemo(database, { demoRunId: `session-${id}`, config: { enabled: true, controlledDemoEnabled: true, apiKey: "fixture", mnemonic: "fixture" }, now });
}

describe("Breez mainnet idempotente", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => postgres.close());

  it("emite uma invoice uma vez e credita evento duplicado apenas uma vez", async () => {
    await seedMainnetIntent("paid");
    const created = await createMainnetContributionInvoice(database, gateway(), { requestId: "request-paid", intentId: "intent-paid", sessionId: "session-paid", demoRunId: "session-paid", idempotencyKey: "invoice:paid", description: "Aporte", now });
    expect(created.duplicate).toBe(false);
    const retry = await createMainnetContributionInvoice(database, gateway(), { requestId: "ignored", intentId: "intent-paid", sessionId: "session-paid", demoRunId: "session-paid", idempotencyKey: "invoice:paid", description: "Aporte", now });
    expect(retry.duplicate).toBe(true);
    const event: BreezPaymentEvent = { eventType: "paymentSucceeded", externalReference: "a".repeat(64), state: "SETTLED", amountSats: 500n, feesSats: 10n, occurredAt: new Date(now.getTime() + 1_000) };
    expect((await processMainnetPaymentEvent(database, event)).duplicate).toBe(false);
    expect((await processMainnetPaymentEvent(database, event)).duplicate).toBe(true);
    const result = await postgres.query<{ funded_amount: string; reserved_amount: string }>("select funded_amount::text, reserved_amount::text from pools where id = 'pool-paid'");
    expect(result.rows[0]).toEqual({ funded_amount: "500", reserved_amount: "0" });
    const ledger = await postgres.query<{ count: number }>("select count(*)::int as count from ledger_entries where transaction_id = 'ledger:request-paid'");
    expect(ledger.rows[0]?.count).toBe(2);
    const polling = await runBreezMainnetPollingCycle(database, gateway({ listPayments: async () => [event] }));
    expect(polling).toEqual({ processed: 1, failures: [] });
  });

  it("isola valor divergente e pagamento atrasado para conciliação", async () => {
    await seedMainnetIntent("mismatch");
    const mismatchGateway = gateway({ createLightningInvoice: async ({ amountSats }) => ({ invoice: "lnbc-mainnet-mismatch", paymentHash: "b".repeat(64), amountSats, feesSats: 10n, expiresAt: new Date(now.getTime() + 30_000) }) });
    await createMainnetContributionInvoice(database, mismatchGateway, { requestId: "request-mismatch", intentId: "intent-mismatch", sessionId: "session-mismatch", demoRunId: "session-mismatch", idempotencyKey: "invoice:mismatch", description: "Aporte", now });
    const result = await processMainnetPaymentEvent(database, { eventType: "paymentSucceeded", externalReference: "b".repeat(64), state: "SETTLED", amountSats: 499n, feesSats: 10n, occurredAt: new Date(now.getTime() + 1_000) });
    expect(result).toMatchObject({ status: "UNKNOWN", allocated: false });
  });

  it("bloqueia atomicamente uma sessão acima de 5.000 sats", async () => {
    await seedMainnetIntent("session-limit", 600n);
    await postgres.query("update mainnet_sessions set requested_amount_sats = 4500 where id = 'session-session-limit'");
    await expect(createMainnetContributionInvoice(database, gateway(), { requestId: "request-limit", intentId: "intent-session-limit", sessionId: "session-session-limit", demoRunId: "session-session-limit", idempotencyKey: "invoice:limit", description: "Aporte", now })).rejects.toMatchObject({ code: "BREEZ_MAINNET_SESSION_LIMIT_EXCEEDED" });
    const session = await postgres.query<{ requested_amount_sats: string }>("select requested_amount_sats::text from mainnet_sessions where id = 'session-session-limit'");
    expect(session.rows[0]?.requested_amount_sats).toBe("4500");
  });

  it("marca swap incerto e bloqueia retry cego", async () => {
    await seedMainnetIntent("swap");
    const prepared = await prepareMainnetAssetSwap(database, gateway(), { swapId: "swap-1", poolId: "pool-swap", idempotencyKey: "swap:1", direction: "L_BTC_TO_USDT", fromAssetId: MAINNET_LBTC_ASSET_ID, toAssetId: MAINNET_USDT_ASSET_ID, receiverAmountUnits: 100_000_000n, maxSlippageBps: 50 });
    const failing = gateway({ executeAssetSwap: async () => { throw new Error("route"); } });
    await expect(executeMainnetAssetSwap(database, failing, "swap-1", prepared as PreparedAssetSwap)).rejects.toThrow("route");
    await expect(executeMainnetAssetSwap(database, failing, "swap-1", prepared as PreparedAssetSwap)).rejects.toMatchObject({ code: "BREEZ_RESULT_UNKNOWN" });
  });

  it("registra divergência de saldo sem alterar o ledger", async () => {
    const result = await reconcileMainnetWallet(database, gateway({ getBalances: async () => ({ btcSats: 501n, assetBalances: { [MAINNET_USDT_ASSET_ID]: 0n } }) }), { runId: "reconcile-1", idempotencyKey: "reconcile:1", usdtAssetId: MAINNET_USDT_ASSET_ID, now });
    expect(result.status).toBe("DIVERGED");
    expect(result.btcDifferenceSats).toBe(1n);
  });

  it("mantém no máximo uma invoice mainnet ativa", async () => {
    await seedMainnetIntent("single-a");
    await seedMainnetIntent("single-b");
    await createMainnetContributionInvoice(database, gateway({ createLightningInvoice: async ({ amountSats }) => ({ invoice: "lnbc-single", paymentHash: "f".repeat(64), amountSats, feesSats: 10n, expiresAt: new Date(now.getTime() + 30_000) }) }), { requestId: "request-single-a", intentId: "intent-single-a", sessionId: "session-single-a", demoRunId: "session-single-a", idempotencyKey: "invoice:single-a", description: "Aporte", now });
    await expect(createMainnetContributionInvoice(database, gateway(), { requestId: "request-single-b", intentId: "intent-single-b", sessionId: "session-single-b", demoRunId: "session-single-b", idempotencyKey: "invoice:single-b", description: "Aporte", now })).rejects.toMatchObject({ code: "MAINNET_DEMO_INVOICE_ALREADY_ACTIVE" });
    await expect(postgres.query("insert into external_payment_requests (id, intent_id, idempotency_key, session_id, environment, purpose, expected_asset, expected_amount, status, expires_at) values ('request-bypass', 'intent-single-b', 'invoice:bypass', 'session-single-b', 'MAINNET', 'CONTRIBUTION', 'BTC', 500, 'PENDING', $1)", [new Date(now.getTime() + 30_000)])).rejects.toThrow("external_payment_requests_single_active_mainnet_unique");
  });
});
