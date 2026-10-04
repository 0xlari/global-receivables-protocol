// @vitest-environment node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { FakeSettlementInvoiceGateway } from "@/integrations/lightning/settlement-invoice-gateway";
import { FakeNwcGateway } from "@/integrations/nwc/fake-gateway";
import { encryptNwcSecret } from "@/integrations/nwc/secret-crypto";
import { runDuePayerPayment } from "./payer-payment-worker";

let postgres: PGlite;
let db: PgliteDatabase<typeof schema>;
const now = new Date("2026-08-01T12:00:00.000Z");

async function seedAuthorization(suffix: string, method: "NWC_AUTOMATIC" | "MANUAL" = "NWC_AUTOMATIC") {
  const authId = `authorization-${suffix}`;
  const digest = createHash("sha256").update(suffix).digest("hex");
  await postgres.query(`insert into receivables (id, requester_id, client_id, nominal_amount, due_at, status, client_accepted_btc) values ($1, 'worker-requester', 'worker-client', 50000, '2026-07-31T12:00:00Z', 'DUE', true)`, [`receivable-${suffix}`]);
  await postgres.query(`insert into receivable_versions (id, receivable_id, version, service_description, payment_purpose, nominal_amount, due_at) values ($1, $2, 1, 'Pagamento fictício', 'SERVICE', 50000, '2026-07-31T12:00:00Z')`, [`version-${suffix}`, `receivable-${suffix}`]);
  await postgres.query(`insert into client_confirmations (id, receivable_id, receivable_version, token_hash, status, expires_at, used_at, client_accepts_btc, confirms_description, confirmed_amount, confirmed_due_at, terms_version) values ($1, $2, 1, $3, 'ACCEPTED', '2026-08-02T12:00:00Z', '2026-07-01T12:00:00Z', true, true, 50000, '2026-07-31T12:00:00Z', 'v1')`, [`confirmation-${suffix}`, `receivable-${suffix}`, digest]);
  await postgres.query(`insert into payer_payment_authorizations (id, public_id, receivable_id, payer_id, confirmation_id, management_token_hash, method, status, max_amount_msat, max_fee_msat, scheduled_for, expires_at) values ($1, $2, $3, 'worker-client', $4, $5, $6, $7, 500000, 10000, '2026-07-31T12:00:00Z', '2026-08-03T12:00:00Z')`, [authId, randomUUID(), `receivable-${suffix}`, `confirmation-${suffix}`, digest, method, method === "MANUAL" ? "MANUAL_PAYMENT_REQUIRED" : "ACTIVE"]);
  if (method === "NWC_AUTOMATIC") await postgres.query(`insert into nwc_connections (id, authorization_id, wallet_service_pubkey, relay_urls, encrypted_connection_secret, connection_fingerprint, supported_methods, last_checked_at) values ($1, $2, $3, '["wss://relay.example.com/"]', $4, $5, '["pay_invoice"]', '2026-07-01T12:00:00Z')`, [`connection-${suffix}`, authId, "1".repeat(64), encryptNwcSecret("2".repeat(64)), digest]);
  return authId;
}

describe("payer payment due worker", () => {
  beforeAll(async () => {
    process.env.NWC_CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    postgres = new PGlite(); db = drizzle(postgres, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    await postgres.exec(`insert into users (id, country_code, status) values ('worker-requester', 'BR', 'ACTIVE'); insert into clients (id, country_code) values ('worker-client', 'US');`);
  }, 30_000);
  afterAll(async () => { delete process.env.NWC_CONNECTION_ENCRYPTION_KEY; await postgres.close(); });

  it("settles once and posts one balanced ledger transaction", async () => {
    const authorizationId = await seedAuthorization("settled");
    const nwc = new FakeNwcGateway(); const invoices = new FakeSettlementInvoiceGateway();
    const first = await runDuePayerPayment(db, { nwc, invoices }, { authorizationId, now });
    const retry = await runDuePayerPayment(db, { nwc, invoices }, { authorizationId, now });
    expect(first.status).toBe("SETTLED"); expect(retry.duplicate).toBe(true); expect(nwc.calls.filter((call) => call === "payInvoice")).toHaveLength(1);
    const counts = await postgres.query<{ ledger: number; entries: number }>(`select count(distinct t.id)::int as ledger, count(e.id)::int as entries from ledger_transactions t join ledger_entries e on e.transaction_id = t.id where t.idempotency_key = 'ledger:payer-payment:authorization-settled'`);
    expect(counts.rows[0]).toEqual({ ledger: 1, entries: 2 });
  });

  it("creates one manual fallback after a definitive failure", async () => {
    const authorizationId = await seedAuthorization("failed"); const invoices = new FakeSettlementInvoiceGateway();
    const result = await runDuePayerPayment(db, { nwc: new FakeNwcGateway({ payment: "INSUFFICIENT_BALANCE" }), invoices }, { authorizationId, now });
    expect(result.status).toBe("MANUAL_PAYMENT_REQUIRED"); expect(result.invoice).toMatch(/^lnbc/);
    const retry = await runDuePayerPayment(db, { nwc: new FakeNwcGateway(), invoices }, { authorizationId, now });
    expect(retry.duplicate).toBe(true); expect(invoices.calls).toHaveLength(1);
  });

  it("does not retry an unknown result", async () => {
    const authorizationId = await seedAuthorization("unknown"); const nwc = new FakeNwcGateway({ payment: "UNKNOWN" });
    const dependencies = { nwc, invoices: new FakeSettlementInvoiceGateway() };
    expect((await runDuePayerPayment(db, dependencies, { authorizationId, now })).status).toBe("UNKNOWN");
    expect((await runDuePayerPayment(db, dependencies, { authorizationId, now })).duplicate).toBe(true);
    expect(nwc.calls.filter((call) => call === "payInvoice")).toHaveLength(1);
  });

  it("creates a manual invoice without calling NWC", async () => {
    const authorizationId = await seedAuthorization("manual", "MANUAL"); const nwc = new FakeNwcGateway();
    const result = await runDuePayerPayment(db, { nwc, invoices: new FakeSettlementInvoiceGateway() }, { authorizationId, now });
    expect(result.status).toBe("MANUAL_PAYMENT_REQUIRED"); expect(nwc.calls).not.toContain("payInvoice");
  });
});
