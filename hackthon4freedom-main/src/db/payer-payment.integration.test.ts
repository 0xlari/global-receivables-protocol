// @vitest-environment node

import { randomBytes } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  connectNwcAuthorization,
  createPayerPaymentAuthorization,
  readPayerPaymentAuthorization,
  revokePayerPaymentAuthorization,
} from "@/db/repositories/payer-payment-repository";
import * as schema from "@/db/schema";
import { hashConfirmationToken } from "@/domain/confirmation-token";
import { FakeNwcGateway } from "@/integrations/nwc/fake-gateway";

const now = new Date("2026-08-01T12:00:00.000Z");
const token = "A".repeat(43);
const pubkey = "1".repeat(64);
const secret = "2".repeat(64);
const nwcUri = `nostr+walletconnect://${pubkey}?relay=${encodeURIComponent("wss://relay.example.com")}&secret=${secret}`;
let postgres: PGlite;
let db: PgliteDatabase<typeof schema>;

async function seedReceivable(id: string, confirmationId: string, rawToken: string) {
  await postgres.query(`
    insert into receivables (id, requester_id, client_id, nominal_amount, due_at, status, client_accepted_btc)
    values ($1, 'payer-requester', 'payer-client', 50000, '2026-08-30T12:00:00Z', 'UNDER_VALIDATION', true)
  `, [id]);
  await postgres.query(`
    insert into receivable_versions (id, receivable_id, version, service_description, payment_purpose, nominal_amount, due_at)
    values ($2, $1, 1, 'Pagamento fictício', 'SERVICE', 50000, '2026-08-30T12:00:00Z')
  `, [id, `version-${id}`]);
  await postgres.query(`
    insert into client_confirmations (id, receivable_id, receivable_version, token_hash, status, expires_at, used_at, client_accepts_btc, confirms_description, confirmed_amount, confirmed_due_at, terms_version)
    values ($2, $1, 1, $3, 'ACCEPTED', '2026-08-10T12:00:00Z', '2026-08-01T12:00:00Z', true, true, 50000, '2026-08-30T12:00:00Z', 'v1')
  `, [id, confirmationId, hashConfirmationToken(rawToken)]);
}

describe("payer payment repository", () => {
  beforeAll(async () => {
    process.env.NWC_CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    postgres = new PGlite();
    db = drizzle(postgres, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    await postgres.exec(`
      insert into users (id, country_code, status) values ('payer-requester', 'BR', 'ACTIVE');
      insert into clients (id, country_code) values ('payer-client', 'US');
    `);
  }, 30_000);

  afterAll(async () => {
    delete process.env.NWC_CONNECTION_ENCRYPTION_KEY;
    await postgres.close();
  });

  it("creates an independent manual authorization", async () => {
    const rawToken = "M".repeat(43);
    await seedReceivable("receivable-manual", "confirmation-manual", rawToken);
    const created = await createPayerPaymentAuthorization(db, {
      receivableId: "receivable-manual", rawConfirmationToken: rawToken,
      method: "MANUAL", maxAmountMsat: 50_000_000n, maxFeeMsat: 100_000n, now,
    });
    expect(created.status).toBe("MANUAL_PAYMENT_REQUIRED");
  });

  it("stores NWC encrypted, returns no secret and supports revocation", async () => {
    await seedReceivable("receivable-auto", "confirmation-auto", token);
    const created = await createPayerPaymentAuthorization(db, {
      receivableId: "receivable-auto", rawConfirmationToken: token,
      method: "NWC_AUTOMATIC", maxAmountMsat: 50_000_000n, maxFeeMsat: 100_000n, now,
    });
    await connectNwcAuthorization(db, new FakeNwcGateway(), {
      publicId: created.publicId, managementToken: created.managementToken, nwcUri, now,
    });
    const read = await readPayerPaymentAuthorization(db, created.publicId, created.managementToken);
    expect(read.status).toBe("ACTIVE");
    expect(JSON.stringify(read)).not.toContain(secret);
    const encrypted = await postgres.query<{ encrypted_connection_secret: string }>("select encrypted_connection_secret from nwc_connections");
    expect(encrypted.rows[0]?.encrypted_connection_secret).not.toContain(secret);

    await expect(readPayerPaymentAuthorization(db, created.publicId, "wrong-token".repeat(4))).rejects.toThrow();
    await revokePayerPaymentAuthorization(db, { publicId: created.publicId, managementToken: created.managementToken, now });
    const revoked = await readPayerPaymentAuthorization(db, created.publicId, created.managementToken);
    expect(revoked.status).toBe("REVOKED");
  });

  it("rejects a wallet without pay_invoice", async () => {
    const rawToken = "N".repeat(43);
    await seedReceivable("receivable-no-pay", "confirmation-no-pay", rawToken);
    const created = await createPayerPaymentAuthorization(db, {
      receivableId: "receivable-no-pay", rawConfirmationToken: rawToken,
      method: "NWC_AUTOMATIC", maxAmountMsat: 50_000_000n, maxFeeMsat: 100_000n, now,
    });
    await expect(connectNwcAuthorization(db, new FakeNwcGateway({ methods: ["get_info"] }), {
      publicId: created.publicId, managementToken: created.managementToken, nwcUri, now,
    })).rejects.toThrow(/pay_invoice/);
  });

  it("rejects reusing the same NWC wallet on a second authorization", async () => {
    const rawTokenA = "P".repeat(43);
    const rawTokenB = "Q".repeat(43);
    const reusePubkey = "3".repeat(64);
    const reuseSecret = "4".repeat(64);
    const reuseUri = `nostr+walletconnect://${reusePubkey}?relay=${encodeURIComponent("wss://relay.example.com")}&secret=${reuseSecret}`;
    await seedReceivable("receivable-reuse-a", "confirmation-reuse-a", rawTokenA);
    await seedReceivable("receivable-reuse-b", "confirmation-reuse-b", rawTokenB);
    const a = await createPayerPaymentAuthorization(db, {
      receivableId: "receivable-reuse-a", rawConfirmationToken: rawTokenA,
      method: "NWC_AUTOMATIC", maxAmountMsat: 50_000_000n, maxFeeMsat: 100_000n, now,
    });
    await connectNwcAuthorization(db, new FakeNwcGateway(), {
      publicId: a.publicId, managementToken: a.managementToken, nwcUri: reuseUri, now,
    });
    const b = await createPayerPaymentAuthorization(db, {
      receivableId: "receivable-reuse-b", rawConfirmationToken: rawTokenB,
      method: "NWC_AUTOMATIC", maxAmountMsat: 50_000_000n, maxFeeMsat: 100_000n, now,
    });
    await expect(connectNwcAuthorization(db, new FakeNwcGateway(), {
      publicId: b.publicId, managementToken: b.managementToken, nwcUri: reuseUri, now,
    })).rejects.toThrow(/já está conectada a outra autorização/);
    const read = await readPayerPaymentAuthorization(db, b.publicId, b.managementToken);
    expect(read.status).toBe("PENDING_CONNECTION");
  });
});
