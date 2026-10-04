// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  allocateContribution,
  closeExpiredPool,
  createSimulationQuote,
  decidePartialPool,
  openPoolForApprovedReceivable,
  recordSettlementSimulation,
  reserveContributionCapacity,
} from "@/db/repositories/pool-repository";
import * as schema from "@/db/schema";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-14T12:00:00.000Z");

async function seedReceivable(id: string, amount = 200_000n) {
  await postgres.query("insert into users (id, country_code, status) values ($1, 'BR', 'ACTIVE') on conflict do nothing", [`requester-${id}`]);
  await postgres.query("insert into clients (id, country_code) values ($1, 'US') on conflict do nothing", [`client-${id}`]);
  await postgres.query("insert into receivables (id, requester_id, client_id, nominal_amount, due_at, status, client_accepted_btc) values ($1, $2, $3, $4, $5, 'APPROVED', true)", [id, `requester-${id}`, `client-${id}`, amount.toString(), new Date("2026-08-13T12:00:00.000Z")]);
}

async function quote(id: string) {
  return createSimulationQuote(database, {
    id: `quote-${id}`,
    btcPriceUsdCents: 6_000_000n,
    sourceReference: `fixture:${id}`,
    quotedAt: now,
    expiresAt: new Date("2026-07-14T12:01:00.000Z"),
    swapFeeUsdCents: 1_000n,
  });
}

async function open(id: string, mode: "FULL_BTC" | "USD_PAIRED" = "FULL_BTC") {
  await seedReceivable(`receivable-${id}`);
  const createdQuote = await quote(id);
  return openPoolForApprovedReceivable(database, {
    poolId: `pool-${id}`,
    receivableId: `receivable-${id}`,
    quoteId: createdQuote.quoteId,
    mode,
    risk: "LOW",
    now,
    closesAt: new Date("2026-07-15T12:00:00.000Z"),
    treasuryBtcReservedSats: mode === "USD_PAIRED" ? 10_000_000n : 0n,
    correlationId: `corr-${id}`,
  });
}

describe("pool e simulador financeiro", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
    await postgres.exec("insert into users (id, country_code, status) values ('contributor-a', 'BR', 'ACTIVE'), ('contributor-b', 'BR', 'ACTIVE')");
  }, 30_000);

  afterAll(async () => postgres.close());

  it("abre pool pareada somente com USDt segregado e tesouraria BTC suficiente", async () => {
    await seedReceivable("receivable-paired-blocked");
    const createdQuote = await quote("paired-blocked");
    await expect(openPoolForApprovedReceivable(database, { poolId: "pool-paired-blocked", receivableId: "receivable-paired-blocked", quoteId: createdQuote.quoteId, mode: "USD_PAIRED", risk: "LOW", now, closesAt: new Date("2026-07-15T12:00:00.000Z"), treasuryBtcReservedSats: 1n, correlationId: "corr-paired-blocked" })).rejects.toMatchObject({ code: "TREASURY_RESERVE_INSUFFICIENT" });

    const opened = await open("paired", "USD_PAIRED");
    expect(opened.simulation.pairedObligationUsdtUnits).toBeGreaterThan(0n);
    const row = await postgres.query<{ settlement_asset: string; environment: string }>("select settlement_asset, environment from pools where id = 'pool-paired'");
    expect(row.rows[0]).toEqual({ settlement_asset: "USDT", environment: "SIMULATION" });
  });

  it("reserva capacidade atomicamente e impede invoices concorrentes acima da meta", async () => {
    const opened = await open("capacity");
    const amount = (opened.simulation.fundingTargetSats * 3n) / 4n;
    const attempts = await Promise.allSettled([
      reserveContributionCapacity(database, { intentId: "intent-capacity-a", poolId: "pool-capacity", contributorId: "contributor-a", amountSats: amount, now, expiresAt: new Date("2026-07-14T12:01:00.000Z") }),
      reserveContributionCapacity(database, { intentId: "intent-capacity-b", poolId: "pool-capacity", contributorId: "contributor-b", amountSats: amount, now, expiresAt: new Date("2026-07-14T12:01:00.000Z") }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
  });

  it("aceita pool parcial e não desconta custos da solicitante do split 30/70", async () => {
    const opened = await open("partial");
    const contributionAmount = opened.simulation.fundingTargetSats / 2n;
    await reserveContributionCapacity(database, { intentId: "intent-partial", poolId: "pool-partial", contributorId: "contributor-a", amountSats: contributionAmount, now, expiresAt: new Date("2026-07-14T12:01:00.000Z") });
    await allocateContribution(database, { contributionId: "contribution-partial", intentId: "intent-partial", poolId: "pool-partial", externalPaymentReference: "simulation:partial", amount: contributionAmount, settledAt: now });
    const closed = await closeExpiredPool(database, { poolId: "pool-partial", now: new Date("2026-07-16T12:00:00.000Z"), correlationId: "corr-close-partial" });
    expect(closed.status).toBe("PARTIAL_EXPIRED");
    const decision = await decidePartialPool(database, { poolId: "pool-partial", requesterId: "requester-receivable-partial", decision: "ACCEPT_PARTIAL", reason: "Aceito o valor parcial", idempotencyKey: "partial:accept", now, correlationId: "corr-partial" });
    expect(decision).toMatchObject({ decision: "ACCEPT_PARTIAL", duplicate: false });
    const retry = await decidePartialPool(database, { poolId: "pool-partial", requesterId: "requester-receivable-partial", decision: "ACCEPT_PARTIAL", reason: "Aceito o valor parcial", idempotencyKey: "partial:accept", now, correlationId: "corr-partial-retry" });
    expect(retry.duplicate).toBe(true);
    await expect(decidePartialPool(database, { poolId: "pool-partial", requesterId: "requester-receivable-partial", decision: "REFUND", reason: "Agora quero reembolso", idempotencyKey: "partial:refund-conflict", now, correlationId: "corr-conflict" })).rejects.toMatchObject({ code: "INVALID_POOL_STATE" });

    const settlement = await recordSettlementSimulation(database, { poolId: "pool-partial", idempotencyKey: "settlement:partial", paymentUsdCents: 100_000n, requesterCostsUsdCents: 1_000n, applicableLossesUsdCents: 0n });
    expect(settlement.netResultUsdCents).toBe(3_000n);
    expect(settlement.platformResultUsdCents! + settlement.contributorsResultUsdCents!).toBe(settlement.netResultUsdCents);
    expect(settlement.platformResultUsdCents).toBe((settlement.netResultUsdCents * 3_000n) / 10_000n);
  });

  it("reembolso parcial afeta somente aportes daquela pool", async () => {
    const opened = await open("refund");
    const amount = opened.simulation.fundingTargetSats / 3n;
    await reserveContributionCapacity(database, { intentId: "intent-refund", poolId: "pool-refund", contributorId: "contributor-b", amountSats: amount, now, expiresAt: new Date("2026-07-14T12:01:00.000Z") });
    await allocateContribution(database, { contributionId: "contribution-refund", intentId: "intent-refund", poolId: "pool-refund", externalPaymentReference: "simulation:refund", amount, settledAt: now });
    await closeExpiredPool(database, { poolId: "pool-refund", now: new Date("2026-07-16T12:00:00.000Z"), correlationId: "corr-close-refund" });
    await decidePartialPool(database, { poolId: "pool-refund", requesterId: "requester-receivable-refund", decision: "REFUND", reason: "Prefiro devolver os aportes", idempotencyKey: "partial:refund", now, correlationId: "corr-refund" });
    const statuses = await postgres.query<{ id: string; status: string }>("select id, status from contributions where id in ('contribution-refund', 'contribution-partial') order by id");
    expect(statuses.rows).toEqual([
      { id: "contribution-partial", status: "ALLOCATED" },
      { id: "contribution-refund", status: "REFUND_PENDING" },
    ]);
  });
});
