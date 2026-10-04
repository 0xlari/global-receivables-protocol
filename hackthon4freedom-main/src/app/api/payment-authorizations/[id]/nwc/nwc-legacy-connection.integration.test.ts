// @vitest-environment node

import { randomBytes } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectNwcAuthorization, createPayerPaymentAuthorization } from "@/db/repositories/payer-payment-repository";
import * as schema from "@/db/schema";
import { hashConfirmationToken } from "@/domain/confirmation-token";
import { FakeNwcGateway } from "@/integrations/nwc/fake-gateway";
import { prepareNwcAuthorizationAttestation } from "@/services/lrp-nwc-attestation-service";

const now = new Date("2026-08-01T12:00:00.000Z");
const token = "A".repeat(43);
const pubkey = "1".repeat(64);
const secret = "2".repeat(64);
const originatorPubkey = "a".repeat(64);
const nwcUri = `nostr+walletconnect://${pubkey}?relay=${encodeURIComponent("wss://relay.example.com")}&secret=${secret}`;
let postgres: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;

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

describe("conexão NWC para recebível legado em modo LRP", () => {
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

  it("conecta com protectRelayMetadata e o atestado falha sem virar 500", async () => {
    await seedReceivable("receivable-legacy-nwc", "confirmation-legacy-nwc", token);
    const created = await createPayerPaymentAuthorization(db, {
      receivableId: "receivable-legacy-nwc", rawConfirmationToken: token,
      method: "NWC_AUTOMATIC", maxAmountMsat: 50_000_000n, maxFeeMsat: 100_000n, now,
    });

    const connection = await connectNwcAuthorization(db, new FakeNwcGateway(), {
      publicId: created.publicId, managementToken: created.managementToken, nwcUri, now,
      protectRelayMetadata: true,
    });
    expect(connection.status).toBe("ACTIVE");
    expect(connection.environment).toBe("SIMULATION");

    await expect(prepareNwcAuthorizationAttestation(db, {
      receivableId: connection.receivableId, mode: "LRP", originatorPubkey, now,
    })).rejects.toThrow("LRP_NWC_PRIVATE_AUTHORIZATION_NOT_FOUND");
  });
});
