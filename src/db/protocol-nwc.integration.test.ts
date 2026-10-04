// @vitest-environment node
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { prepareProtocolNwcAuthorization } from "@/db/repositories/protocol-nwc-repository";
import { FakeNwcGateway } from "@/integrations/nwc/fake-gateway";

describe("private protocol NWC authorization", () => {
  const postgres = new PGlite(); const db = drizzle(postgres, { schema }); const secret = "2".repeat(64); const uri = `nostr+walletconnect://${"1".repeat(64)}?relay=${encodeURIComponent("wss://relay.example.com")}&secret=${secret}`;
  beforeAll(async () => { process.env.NWC_CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString("base64"); await migrate(db, { migrationsFolder: "drizzle" }); }, 30_000);
  afterAll(async () => { delete process.env.NWC_CONNECTION_ENCRYPTION_KEY; await postgres.close(); });
  it("cifra a URI completa e devolve somente fingerprint público", async () => {
    const result = await prepareProtocolNwcAuthorization(db, new FakeNwcGateway(), { receivableEventId: "a".repeat(64), clientPubkey: "b".repeat(64), nwcUri: uri, maxAmountMsat: 1000n, dueAt: new Date("2026-08-10T00:00:00Z"), expiresAt: new Date("2026-08-13T00:00:00Z"), now: new Date("2026-08-01T00:00:00Z") });
    const stored = await postgres.query<{ encrypted_connection_uri: string }>("select encrypted_connection_uri from protocol_nwc_authorizations");
    expect(stored.rows[0]?.encrypted_connection_uri).not.toContain(secret); expect(JSON.stringify(result)).not.toContain(secret); expect(result.safeFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
