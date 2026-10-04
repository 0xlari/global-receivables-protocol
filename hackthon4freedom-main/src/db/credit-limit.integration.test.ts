// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  recalculateCreditLimit,
  releaseCreditLimit,
  reserveCreditLimit,
} from "@/db/repositories/credit-limit-repository";
import * as schema from "@/db/schema";

let postgres: PGlite;
let database: PgliteDatabase<typeof schema>;

async function seedUser(id: string) {
  await postgres.query(
    "insert into users (id, country_code, status) values ($1, 'BR', 'ACTIVE')",
    [id],
  );
}

const now = new Date("2026-07-14T12:00:00.000Z");

describe("credit limit persistence", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);

  afterAll(async () => {
    await postgres.close();
  });

  it("creates the explainable US$ 100 base limit", async () => {
    await seedUser("limit-base");

    const result = await recalculateCreditLimit(database, {
      userId: "limit-base",
      idempotencyKey: "limit:base:1",
      correlationId: "correlation-base",
      reason: "INITIAL_CALCULATION",
      now,
    });

    expect(result).toMatchObject({
      totalUsdCents: 10_000n,
      usedUsdCents: 0n,
      availableUsdCents: 10_000n,
      duplicate: false,
    });
  });

  it("counts only consented, verified and unexpired signals", async () => {
    await seedUser("limit-signals");
    await postgres.exec(`
      insert into consents (id, user_id, type, policy_version, granted_at)
      values
        ('consent-identity', 'limit-signals', 'IDENTITY_PROCESSING', 'policy-v1', now()),
        ('consent-professional', 'limit-signals', 'PROFESSIONAL_ACCOUNT', 'policy-v1', now());
      insert into identity_evidences
        (id, user_id, type, provider, protected_reference, status, verified_at, expires_at)
      values
        ('evidence-identity', 'limit-signals', 'IDENTITY', 'internal', 'protected:identity', 'VERIFIED', now(), '2027-01-01'),
        ('evidence-professional-a', 'limit-signals', 'PROFESSIONAL_ACCOUNT', 'github', 'protected:github', 'VERIFIED', now(), '2027-01-01'),
        ('evidence-professional-b', 'limit-signals', 'PROFESSIONAL_ACCOUNT', 'linkedin', 'protected:linkedin', 'VERIFIED', now(), '2027-01-01'),
        ('evidence-expired', 'limit-signals', 'PROFESSIONAL_ACCOUNT', 'portfolio', 'protected:portfolio', 'VERIFIED', now(), '2025-01-01');
      insert into reputation_facts
        (id, subject_type, subject_id, type, status, evidence_reference, occurred_at)
      values
        ('fact-paid-1', 'USER', 'limit-signals', 'RECEIVABLE_PAID', 'ACTIVE', 'operation:paid:1', '2026-01-01'),
        ('fact-paid-2', 'USER', 'limit-signals', 'RECEIVABLE_PAID', 'ACTIVE', 'operation:paid:2', '2026-02-01');
    `);

    const result = await recalculateCreditLimit(database, {
      userId: "limit-signals",
      idempotencyKey: "limit:signals:1",
      correlationId: "correlation-signals",
      reason: "VERIFIED_SIGNALS_CHANGED",
      now,
    });

    expect(result.totalUsdCents).toBe(60_000n);
  });

  it("uses only simulated active collateral and applies the 2x rule", async () => {
    await seedUser("limit-collateral");
    await postgres.exec(`
      insert into collaterals
        (id, user_id, asset, nominal_amount, eligible_usd_cents, status, environment, reference)
      values
        ('collateral-demo', 'limit-collateral', 'BTC', 1000000, 50000, 'ACTIVE', 'SIMULATION', 'collateral:demo');
    `);

    const result = await recalculateCreditLimit(database, {
      userId: "limit-collateral",
      idempotencyKey: "limit:collateral:1",
      correlationId: "correlation-collateral",
      reason: "SIMULATED_COLLATERAL_CHANGED",
      now,
    });

    expect(result.totalUsdCents).toBe(100_000n);
    await expect(
      postgres.query(
        "update collaterals set status = 'PROPOSED' where id = 'collateral-demo'",
      ),
    ).rejects.toThrow(/invalid collateral transition/i);
  });

  it("records one event for an idempotent recalculation", async () => {
    await seedUser("limit-idempotent");
    const operation = {
      userId: "limit-idempotent",
      idempotencyKey: "limit:idempotent:1",
      correlationId: "correlation-idempotent",
      reason: "INITIAL_CALCULATION",
      now,
    } as const;

    const first = await recalculateCreditLimit(database, operation);
    const retry = await recalculateCreditLimit(database, operation);
    const events = await postgres.query<{ count: number }>(
      "select count(*)::int as count from credit_limit_events where user_id = 'limit-idempotent'",
    );

    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(events.rows[0]?.count).toBe(1);
    await expect(
      postgres.query(
        "update credit_limit_events set reason = 'CHANGED' where user_id = 'limit-idempotent'",
      ),
    ).rejects.toThrow(/append-only/i);
  });

  it("serializes concurrent reservations so the limit cannot be spent twice", async () => {
    await seedUser("limit-concurrency");
    await recalculateCreditLimit(database, {
      userId: "limit-concurrency",
      idempotencyKey: "limit:concurrency:calculation",
      correlationId: "correlation-concurrency",
      reason: "INITIAL_CALCULATION",
      now,
    });

    const attempts = await Promise.allSettled([
      reserveCreditLimit(database, {
        userId: "limit-concurrency",
        idempotencyKey: "limit:concurrency:reserve-a",
        correlationId: "correlation-reserve-a",
        reason: "RECEIVABLE_RESERVED",
        amountUsdCents: 6_000n,
        now,
      }),
      reserveCreditLimit(database, {
        userId: "limit-concurrency",
        idempotencyKey: "limit:concurrency:reserve-b",
        correlationId: "correlation-reserve-b",
        reason: "RECEIVABLE_RESERVED",
        amountUsdCents: 6_000n,
        now,
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(
      1,
    );

    const limit = await postgres.query<{ used_amount: string }>(
      "select used_amount::text from credit_limits where user_id = 'limit-concurrency'",
    );
    expect(limit.rows[0]?.used_amount).toBe("6000");
  });

  it("blocks new reservations when revocation leaves the profile overcommitted", async () => {
    await seedUser("limit-revocation");
    await postgres.exec(`
      insert into consents (id, user_id, type, policy_version, granted_at)
      values ('consent-revocation', 'limit-revocation', 'IDENTITY_PROCESSING', 'policy-v1', now());
      insert into identity_evidences
        (id, user_id, type, provider, protected_reference, status, verified_at)
      values
        ('evidence-revocation', 'limit-revocation', 'IDENTITY', 'internal', 'protected:revocation', 'VERIFIED', now());
    `);
    await recalculateCreditLimit(database, {
      userId: "limit-revocation",
      idempotencyKey: "limit:revocation:before",
      correlationId: "correlation-revocation-before",
      reason: "IDENTITY_VERIFIED",
      now,
    });
    await reserveCreditLimit(database, {
      userId: "limit-revocation",
      idempotencyKey: "limit:revocation:reserve",
      correlationId: "correlation-revocation-reserve",
      reason: "RECEIVABLE_RESERVED",
      amountUsdCents: 15_000n,
      now,
    });
    await postgres.exec(`
      update identity_evidences
      set status = 'REVOKED', revoked_at = now()
      where id = 'evidence-revocation';
      update consents set revoked_at = now() where id = 'consent-revocation';
    `);

    const recalculated = await recalculateCreditLimit(database, {
      userId: "limit-revocation",
      idempotencyKey: "limit:revocation:after",
      correlationId: "correlation-revocation-after",
      reason: "EVIDENCE_REVOKED",
      now,
    });

    expect(recalculated.totalUsdCents).toBe(10_000n);
    expect(recalculated.usedUsdCents).toBe(15_000n);
    expect(recalculated.availableUsdCents).toBe(0n);
    await expect(
      reserveCreditLimit(database, {
        userId: "limit-revocation",
        idempotencyKey: "limit:revocation:blocked",
        correlationId: "correlation-revocation-blocked",
        reason: "RECEIVABLE_RESERVED",
        amountUsdCents: 1n,
        now,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "CREDIT_LIMIT_EXCEEDED" }),
    );
  });

  it("releases a reservation once and audits the operation", async () => {
    await seedUser("limit-release");
    await recalculateCreditLimit(database, {
      userId: "limit-release",
      idempotencyKey: "limit:release:calculate",
      correlationId: "correlation-release-calculate",
      reason: "INITIAL_CALCULATION",
      now,
    });
    await reserveCreditLimit(database, {
      userId: "limit-release",
      idempotencyKey: "limit:release:reserve",
      correlationId: "correlation-release-reserve",
      reason: "RECEIVABLE_RESERVED",
      amountUsdCents: 4_000n,
      now,
    });
    const operation = {
      userId: "limit-release",
      idempotencyKey: "limit:release:release",
      correlationId: "correlation-release-release",
      reason: "RESERVATION_CANCELLED",
      amountUsdCents: 4_000n,
      now,
    } as const;

    const first = await releaseCreditLimit(database, operation);
    const retry = await releaseCreditLimit(database, operation);

    expect(first.usedUsdCents).toBe(0n);
    expect(first.duplicate).toBe(false);
    expect(retry.usedUsdCents).toBe(0n);
    expect(retry.duplicate).toBe(true);
  });
});
