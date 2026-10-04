// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordBreezReadinessAudit } from "@/db/repositories/breez-readiness-repository";
import { evaluateBreezReadiness, type BreezReadinessEvidence } from "@/domain/breez-readiness";
import { MAINNET_LBTC_ASSET_ID, MAINNET_USDT_ASSET_ID } from "@/integrations/breez/config";
import * as schema from "@/db/schema";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-14T12:00:30.000Z");
const evidence: BreezReadinessEvidence = {
  sdkVersion: "0.12.4", network: "mainnet", lbtcAssetId: MAINNET_LBTC_ASSET_ID, usdtAssetId: MAINNET_USDT_ASSET_ID, usdtPrecision: 8, usdcConfigured: false,
  workingDirPersistent: true, operatorNamed: true, externalProbeEnabled: true, externalExecutionAttempted: false, routePrepared: true,
  routeFromAssetId: MAINNET_LBTC_ASSET_ID, routeToAssetId: MAINNET_USDT_ASSET_ID, receiverAmountUnits: 100_000_000n, estimatedAssetFeesUnits: 100_000n,
  maxSlippageBps: 100, quotePreparedAt: new Date("2026-07-14T12:00:00.000Z"), quoteExpiresAt: new Date("2026-07-14T12:01:00.000Z"),
  walletBtcSats: 1_000n, refundableCount: 0, unknownPaymentCount: 0, reconciliationMatched: true,
  backup: { attempted: true, verified: true, proofHash: "a".repeat(64), sourceSnapshotHash: "b".repeat(64), restoredSnapshotHash: "b".repeat(64) },
};

describe("Breez readiness audit persistence", () => {
  beforeAll(async () => { postgres = new PGlite(); database = drizzle(postgres, { schema }); await migrate(database, { migrationsFolder: "drizzle" }); }, 30_000);
  afterAll(async () => { await postgres.close(); });
  it("records an immutable idempotent GO report", async () => {
    const decision = evaluateBreezReadiness(evidence, now);
    const input = { id: "audit-go", idempotencyKey: "audit:session-1", evidence, decision, completedAt: now };
    expect(await recordBreezReadinessAudit(database, input)).toMatchObject({ status: "GO", duplicate: false });
    expect(await recordBreezReadinessAudit(database, input)).toMatchObject({ auditId: "audit-go", duplicate: true });
    const changed = { ...evidence, operatorNamed: false };
    await expect(recordBreezReadinessAudit(database, { ...input, evidence: changed, decision: evaluateBreezReadiness(changed, now) })).rejects.toMatchObject({ code: "BREEZ_AUDIT_IDEMPOTENCY_CONFLICT" });
  });
  it("database rejects USDC, excessive balance or an audit that executed effects", async () => {
    const values = [
      { id: "bad-usdc", usdc: true, executed: false, btc: 1_000 },
      { id: "bad-balance", usdc: false, executed: false, btc: 10_001 },
      { id: "bad-execution", usdc: false, executed: true, btc: 1_000 },
    ];
    for (const value of values) {
      await expect(postgres.query(`insert into mainnet_readiness_audits (id, idempotency_key, report_hash, status, all_checks_passed, sdk_version, network, lbtc_asset_id, usdt_asset_id, usdt_precision, usdc_configured, working_dir_persistent, operator_named, max_slippage_bps, external_probe_enabled, external_execution_attempted, route_prepared, wallet_btc_sats, refundable_count, unknown_payment_count, reconciliation_matched, backup_restore_verified, backup_proof_hash, checks, completed_at) values ($1, $2, $3, 'NO_GO', false, '0.12.4', 'mainnet', $4, $5, 8, $6, true, true, 100, false, $7, false, $8, 0, 0, false, false, null, '[]', now())`, [value.id, `audit:${value.id}`, "f".repeat(64), MAINNET_LBTC_ASSET_ID, MAINNET_USDT_ASSET_ID, value.usdc, value.executed, value.btc])).rejects.toThrow();
    }
  });
});
