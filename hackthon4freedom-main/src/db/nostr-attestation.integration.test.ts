// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { EventTemplate } from "nostr-tools";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSignedAttestation, publishAttestation } from "@/db/repositories/nostr-attestation-repository";
import type { NostrEventSigner } from "@/domain/nostr-attestation";
import type { NostrRelayGateway } from "@/integrations/nostr/relay";
import * as schema from "@/db/schema";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const platformSecret = generateSecretKey();
const signer: NostrEventSigner = { method: "institutional", getPublicKey: async () => getPublicKey(platformSecret), signEvent: async (event: EventTemplate) => finalizeEvent(event, platformSecret) };

describe("Nostr attestation persistence", () => {
  beforeAll(async () => {
    postgres = new PGlite(); database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
    await postgres.query("insert into users (id, country_code, reputation_id) values ('subject', 'BR', '019f605e-94c9-7140-8374-0d9f39119c4e')");
  }, 30_000);
  afterAll(async () => { await postgres.close(); });

  it("deduplicates semantic facts and keeps correction history", async () => {
    const input = { subjectUserId: "subject", semanticKey: "operation:opaque-1", assertion: "operation_completed" as const, operationRef: "a".repeat(64), evidenceHash: "b".repeat(64), occurredAt: new Date("2026-07-14T12:00:00.000Z") };
    const first = await createSignedAttestation(database, signer, input);
    const duplicate = await createSignedAttestation(database, signer, input);
    const correction = await createSignedAttestation(database, signer, { ...input, semanticKey: "operation:opaque-1:correction", assertion: "dispute_resolved", operationRef: "c".repeat(64), evidenceHash: "d".repeat(64), correctionOfId: first.attestationId });
    expect(duplicate).toMatchObject({ attestationId: first.attestationId, duplicate: true });
    const rows = await postgres.query<{ id: string; status: string; correction_of_id: string | null }>("select id, status, correction_of_id from nostr_attestations order by created_at");
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.find((row) => row.id === first.attestationId)?.status).toBe("CORRECTED");
    expect(rows.rows.find((row) => row.id === correction.attestationId)?.correction_of_id).toBe(first.attestationId);
  });

  it("records relay acknowledgements independently and publishes only with two", async () => {
    const [stored] = await postgres.query<{ id: string; signed_event: unknown }>("select id, signed_event from nostr_attestations where correction_of_id is not null limit 1").then((result) => result.rows);
    const gateway: NostrRelayGateway = { publish: async (url) => { if (url.includes("off")) throw new Error("offline"); }, read: async () => stored?.signed_event as never };
    const partial = await publishAttestation(database, gateway, { attestationId: stored!.id, relays: ["wss://ok.example", "wss://off.example"] });
    expect(partial.acknowledged).toBe(1);
    const final = await publishAttestation(database, { publish: async () => undefined, read: async () => stored?.signed_event as never }, { attestationId: stored!.id, relays: ["wss://ok.example", "wss://two.example"] });
    expect(final.acknowledged).toBe(2);
    const status = await postgres.query<{ status: string }>("select status from nostr_attestations where id = $1", [stored!.id]);
    expect(status.rows[0]?.status).toBe("PUBLISHED");
  });
});
