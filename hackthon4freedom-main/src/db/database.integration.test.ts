// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordLedgerTransaction } from "@/db/repositories/ledger-repository";
import { allocateContribution } from "@/db/repositories/pool-repository";
import * as schema from "@/db/schema";

let postgres: PGlite;
let database: PgliteDatabase<typeof schema>;

async function seedApprovedReceivable(id: string) {
  await postgres.query(
    `insert into receivables
      (id, requester_id, client_id, contract_asset, nominal_amount, due_at, status, client_accepted_btc)
     values ($1, 'user-demo', 'client-demo', 'USD_REFERENCE', 200000, now() + interval '30 days', 'APPROVED', true)`,
    [id],
  );
}

async function seedOpenPool(id: string, receivableId: string, target: bigint) {
  await seedApprovedReceivable(receivableId);
  await postgres.query(
    `insert into pools
      (id, receivable_id, mode, funding_asset, settlement_asset, target_amount, status, closes_at)
     values ($1, $2, 'FULL_BTC', 'BTC', 'BTC', $3, 'DRAFT', now() + interval '7 days')`,
    [id, receivableId, target.toString()],
  );
  await postgres.query("update pools set status = 'OPEN' where id = $1", [id]);
}

describe("PostgreSQL financial constraints", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
    await postgres.exec(`
      insert into users (id, country_code, status)
      values ('user-demo', 'BR', 'ACTIVE'), ('contributor-demo', 'BR', 'ACTIVE');
      insert into clients (id, country_code)
      values ('client-demo', 'US');
    `);
  }, 30_000);

  afterAll(async () => {
    await postgres.close();
  });

  it("applies every versioned migration", async () => {
    const result = await postgres.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations",
    );

    expect(result.rows[0]?.count).toBe(26);
  });

  it("protects every LRP private, operational, and API-only projection table", async () => {
    const protectedTables = [
      "payer_payment_authorizations",
      "nwc_connections",
      "scheduled_payment_attempts",
      "protocol_nwc_authorizations",
      "lrp_public_events",
      "lrp_publication_attempts",
      "lrp_entity_links",
      "lrp_receivable_projections",
      "lrp_pool_projections",
      "lrp_projection_runs",
      "lrp_receivable_originations",
      "lrp_originator_events",
      "lrp_pool_originations",
    ];
    const placeholders = protectedTables.map((_, index) => `$${index + 1}`).join(", ");
    const rls = await postgres.query<{ table_name: string; rls_enabled: boolean }>(
      `select c.relname as table_name, c.relrowsecurity as rls_enabled
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in (${placeholders})`,
      protectedTables,
    );
    const policies = await postgres.query<{ count: number }>(
      `select count(*)::int as count
       from pg_policies
       where schemaname = 'public' and tablename in (${placeholders})`,
      protectedTables,
    );

    expect(rls.rows).toHaveLength(protectedTables.length);
    expect(rls.rows.every(({ rls_enabled: enabled }) => enabled)).toBe(true);
    expect(policies.rows[0]?.count).toBe(0);
  });

  it("does not change RLS on legacy MVP tables", async () => {
    const result = await postgres.query<{ table_name: string; rls_enabled: boolean }>(
      `select c.relname as table_name, c.relrowsecurity as rls_enabled
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in ('users', 'receivables', 'pools')
       order by c.relname`,
    );

    expect(result.rows).toHaveLength(3);
    expect(result.rows.every(({ rls_enabled: enabled }) => !enabled)).toBe(true);
  });

  it("enforces one single-use payer authorization per receivable", async () => {
    await postgres.exec(`
      insert into receivables
        (id, requester_id, client_id, contract_asset, nominal_amount, due_at, status, client_accepted_btc)
      values
        ('receivable-nwc', 'user-demo', 'client-demo', 'USD_REFERENCE', 10000, now() + interval '10 days', 'UNDER_VALIDATION', true);
      insert into receivable_versions
        (id, receivable_id, version, service_description, payment_purpose, contract_asset, nominal_amount, due_at)
      values
        ('receivable-version-nwc', 'receivable-nwc', 1, 'Pagamento fictício', 'SERVICE', 'USD_REFERENCE', 10000, now() + interval '10 days');
      insert into client_confirmations
        (id, receivable_id, receivable_version, token_hash, status, expires_at, used_at, client_accepts_btc, confirms_description, confirmed_amount, confirmed_due_at, terms_version)
      values
        ('confirmation-nwc', 'receivable-nwc', 1, repeat('a', 64), 'ACCEPTED', now() + interval '10 days', now(), true, true, 10000, now() + interval '10 days', 'v1');
      insert into payer_payment_authorizations
        (id, public_id, receivable_id, payer_id, confirmation_id, management_token_hash, method, status, max_amount_msat, max_fee_msat, scheduled_for, expires_at)
      values
        ('authorization-nwc', '018f2f72-8468-7c4f-bab1-51ba445e68d1', 'receivable-nwc', 'client-demo', 'confirmation-nwc', repeat('b', 64), 'NWC_AUTOMATIC', 'PENDING_CONNECTION', 1000000, 10000, now() + interval '10 days', now() + interval '11 days');
    `);

    await expect(postgres.query(`
      insert into payer_payment_authorizations
        (id, public_id, receivable_id, payer_id, confirmation_id, management_token_hash, method, status, max_amount_msat, max_fee_msat, scheduled_for, expires_at)
      values
        ('authorization-duplicate', '018f2f72-8468-7c4f-bab1-51ba445e68d2', 'receivable-nwc', 'client-demo', 'confirmation-nwc', repeat('c', 64), 'MANUAL', 'MANUAL_PAYMENT_REQUIRED', 1000000, 10000, now() + interval '10 days', now() + interval '11 days')
    `)).rejects.toThrow();
  });

  it("does not approve a receivable without explicit BTC acceptance", async () => {
    await expect(
      postgres.query(`
        insert into receivables
          (id, requester_id, client_id, contract_asset, nominal_amount, due_at, status, client_accepted_btc)
        values
          ('receivable-no-btc', 'user-demo', 'client-demo', 'USD_REFERENCE', 10000, now() + interval '10 days', 'APPROVED', false)
      `),
    ).rejects.toThrow();
  });

  it("allows at most one active pool per receivable", async () => {
    await seedApprovedReceivable("receivable-one-pool");
    await postgres.query(`
      insert into pools
        (id, receivable_id, mode, funding_asset, settlement_asset, target_amount, status, closes_at)
      values
        ('pool-one', 'receivable-one-pool', 'FULL_BTC', 'BTC', 'BTC', 1000, 'DRAFT', now() + interval '7 days')
    `);

    await expect(
      postgres.query(`
        insert into pools
          (id, receivable_id, mode, funding_asset, settlement_asset, target_amount, status, closes_at)
        values
          ('pool-two', 'receivable-one-pool', 'FULL_BTC', 'BTC', 'BTC', 1000, 'DRAFT', now() + interval '7 days')
      `),
    ).rejects.toThrow();
  });

  it("rejects impossible pool state transitions", async () => {
    await seedOpenPool("pool-state", "receivable-state", 1_000n);

    await expect(
      postgres.query("update pools set status = 'FUNDED' where id = 'pool-state'"),
    ).rejects.toThrow(/invalid pool transition/i);
  });

  it("rejects validation decisions that skip rule execution", async () => {
    await seedApprovedReceivable("receivable-validation-state");
    await postgres.query(`
      insert into validations (id, receivable_id, status, rules_version)
      values ('validation-state', 'receivable-validation-state', 'PENDING', 'rules-v0.1')
    `);

    await expect(
      postgres.query(
        "update validations set status = 'PASSED' where id = 'validation-state'",
      ),
    ).rejects.toThrow(/invalid validation transition/i);
  });

  it("posts balanced entries and makes them immutable", async () => {
    await postgres.exec(`
      insert into ledger_accounts (id, code, asset, owner_type)
      values
        ('account-custody', 'CUSTODY', 'BTC', 'PLATFORM'),
        ('account-pool', 'POOL_LIABILITY', 'BTC', 'POOL');

      begin;
      insert into ledger_transactions
        (id, idempotency_key, description, status, correlation_id)
      values
        ('ledger-balanced', 'payment:balanced', 'Aporte fictício', 'PENDING', 'corr-balanced');
      insert into ledger_entries
        (id, transaction_id, account_id, asset, amount)
      values
        ('entry-balanced-1', 'ledger-balanced', 'account-custody', 'BTC', 1000),
        ('entry-balanced-2', 'ledger-balanced', 'account-pool', 'BTC', -1000);
      update ledger_transactions set status = 'POSTED', posted_at = now()
      where id = 'ledger-balanced';
      commit;
    `);

    await expect(
      postgres.query(
        "update ledger_entries set amount = 999 where id = 'entry-balanced-1'",
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it("rolls back an unbalanced ledger transaction", async () => {
    await expect(
      postgres.exec(`
        begin;
        insert into ledger_transactions
          (id, idempotency_key, description, status, correlation_id)
        values
          ('ledger-unbalanced', 'payment:unbalanced', 'Inválida', 'PENDING', 'corr-unbalanced');
        insert into ledger_entries
          (id, transaction_id, account_id, asset, amount)
        values
          ('entry-unbalanced-1', 'ledger-unbalanced', 'account-custody', 'BTC', 1000),
          ('entry-unbalanced-2', 'ledger-unbalanced', 'account-pool', 'BTC', -999);
        update ledger_transactions set status = 'POSTED', posted_at = now()
        where id = 'ledger-unbalanced';
        commit;
      `),
    ).rejects.toThrow(/not balanced/i);

    const result = await postgres.query<{ count: number }>(
      "select count(*)::int as count from ledger_transactions where id = 'ledger-unbalanced'",
    );
    expect(result.rows[0]?.count).toBe(0);
  });

  it("returns the original ledger transaction on an idempotent retry", async () => {
    await postgres.exec(`
      insert into ledger_accounts (id, code, asset, owner_type)
      values
        ('account-retry-asset', 'RETRY_ASSET', 'BTC', 'PLATFORM'),
        ('account-retry-liability', 'RETRY_LIABILITY', 'BTC', 'POOL')
      on conflict do nothing;
    `);

    const first = await recordLedgerTransaction(database, {
      id: "ledger-retry-original",
      idempotencyKey: "payment:ledger-retry",
      correlationId: "correlation-ledger-retry",
      description: "Teste idempotente",
      postings: [
        { accountId: "account-retry-asset", asset: "BTC", amount: 700n },
        {
          accountId: "account-retry-liability",
          asset: "BTC",
          amount: -700n,
        },
      ],
    });
    const retry = await recordLedgerTransaction(database, {
      id: "ledger-retry-ignored",
      idempotencyKey: "payment:ledger-retry",
      correlationId: "correlation-ledger-retry-duplicate",
      description: "Repetição",
      postings: [
        { accountId: "account-retry-asset", asset: "BTC", amount: 700n },
        {
          accountId: "account-retry-liability",
          asset: "BTC",
          amount: -700n,
        },
      ],
    });

    expect(first).toEqual({
      transactionId: "ledger-retry-original",
      duplicate: false,
    });
    expect(retry).toEqual({
      transactionId: "ledger-retry-original",
      duplicate: true,
    });
  });

  it("keeps allocation, contribution and pool totals consistent", async () => {
    await seedOpenPool("pool-funding", "receivable-funding", 1_000n);
    await postgres.exec(`
      insert into contribution_intents
        (id, pool_id, contributor_id, amount, asset, status)
      values
        ('intent-funding', 'pool-funding', 'contributor-demo', 600, 'BTC', 'PENDING');

      begin;
      insert into contributions
        (id, intent_id, external_payment_reference, amount, asset, status, settled_at)
      values
        ('contribution-funding', 'intent-funding', 'payment:funding', 600, 'BTC', 'SETTLED', now());
      update pools set funded_amount = funded_amount + 600 where id = 'pool-funding';
      insert into pool_allocations (pool_id, contribution_id, amount)
      values ('pool-funding', 'contribution-funding', 600);
      update contributions set status = 'ALLOCATED' where id = 'contribution-funding';
      commit;
    `);

    const result = await postgres.query<{ funded_amount: string }>(
      "select funded_amount::text from pools where id = 'pool-funding'",
    );
    expect(result.rows[0]?.funded_amount).toBe("600");

    await expect(
      postgres.query(
        "update pools set funded_amount = 1001 where id = 'pool-funding'",
      ),
    ).rejects.toThrow();
  });

  it("deduplicates concurrent payment references", async () => {
    await seedOpenPool("pool-idempotency", "receivable-idempotency", 1_000n);
    await postgres.exec(`
      insert into contribution_intents
        (id, pool_id, contributor_id, amount, asset, status)
      values
        ('intent-idempotency', 'pool-idempotency', 'contributor-demo', 100, 'BTC', 'PENDING');
    `);

    const attempts = await Promise.allSettled([
      postgres.query(`
        insert into contributions
          (id, intent_id, external_payment_reference, amount, asset, status, settled_at)
        values
          ('contribution-race-a', 'intent-idempotency', 'payment:same', 100, 'BTC', 'SETTLED', now())
      `),
      postgres.query(`
        insert into contributions
          (id, intent_id, external_payment_reference, amount, asset, status, settled_at)
        values
          ('contribution-race-b', 'intent-idempotency', 'payment:same', 100, 'BTC', 'SETTLED', now())
      `),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(
      1,
    );
  });

  it("allocates a settled contribution once and returns the original on retry", async () => {
    await seedOpenPool("pool-repository", "receivable-repository", 500n);
    await postgres.exec(`
      insert into contribution_intents
        (id, pool_id, contributor_id, amount, asset, status)
      values
        ('intent-repository', 'pool-repository', 'contributor-demo', 500, 'BTC', 'PENDING');
    `);

    const input = {
      contributionId: "contribution-repository",
      intentId: "intent-repository",
      poolId: "pool-repository",
      externalPaymentReference: "payment:repository",
      amount: 500n,
      settledAt: new Date("2026-07-14T12:00:00.000Z"),
    } as const;

    const first = await allocateContribution(database, input);
    const retry = await allocateContribution(database, {
      ...input,
      contributionId: "contribution-repository-ignored",
    });

    expect(first).toEqual({
      contributionId: "contribution-repository",
      duplicate: false,
      poolFundedAmount: 500n,
    });
    expect(retry).toEqual({
      contributionId: "contribution-repository",
      duplicate: true,
    });
  });
});
