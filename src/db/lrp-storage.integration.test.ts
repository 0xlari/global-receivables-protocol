// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FakeSigner } from "@nostr/signer";
import { buildReceivableCreated } from "@protocol/builders";
import { LRP_EVENT_VERSION } from "@protocol/version";
import {
  beginLrpPublication,
  linkLrpEntity,
  listLrpPublicEvents,
} from "@/db/repositories/lrp-event-repository";
import { clearLrpProjections, replaceLrpProjections } from "@/db/repositories/lrp-projection-repository";
import * as schema from "@/db/schema";

let postgres: PGlite;
let database: PgliteDatabase<typeof schema>;
const signer = new FakeSigner(new Uint8Array(32).fill(31));

async function event() {
  const pubkey = await signer.getPublicKey();
  return signer.signEvent(buildReceivableCreated({
    protocol_version: LRP_EVENT_VERSION,
    event_type: "ReceivableCreated",
    receivable_id: "receivable-public-1",
    title: "Recebivel publico",
    provider_pseudonym: "Criadora 31",
    provider_pubkey: pubkey,
    nominal_amount_minor: "10000",
    original_currency: "USD",
    due_at: 1_800_086_400,
    category: "SERVICE",
    country: "BR",
    private_evidence_hash: "a".repeat(64),
    receivable_version: 1,
    created_at: 1_800_000_000,
  }));
}

describe("LRP reconstructible PostgreSQL storage", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);

  afterAll(async () => { await postgres.close(); });

  it("stores one signed event and keeps publication retry idempotent", async () => {
    const signed = await event();
    const first = await beginLrpPublication(database, {
      idempotencyKey: "receivable:private-1:created",
      entityType: "RECEIVABLE",
      privateEntityId: "private-1",
      event: signed,
      now: new Date("2026-07-21T12:00:00Z"),
    });
    const retry = await beginLrpPublication(database, {
      idempotencyKey: "receivable:private-1:created",
      entityType: "RECEIVABLE",
      privateEntityId: "private-1",
      event: signed,
      now: new Date("2026-07-21T12:01:00Z"),
    });
    expect(first.duplicate).toBe(false);
    expect(retry).toMatchObject({ duplicate: true, publication: { eventId: signed.id } });
    expect(await listLrpPublicEvents(database)).toHaveLength(1);
  });

  it("makes the private/public link immutable and preserves events when projections are cleared", async () => {
    const signed = await event();
    const first = await linkLrpEntity(database, {
      entityType: "RECEIVABLE",
      privateEntityId: "private-1",
      eventType: "ReceivableCreated",
      eventId: signed.id,
      canonicalSource: "LRP",
    });
    const retry = await linkLrpEntity(database, {
      entityType: "RECEIVABLE",
      privateEntityId: "private-1",
      eventType: "ReceivableCreated",
      eventId: signed.id,
      canonicalSource: "LRP",
    });
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    await clearLrpProjections(database);
    expect(await listLrpPublicEvents(database)).toHaveLength(1);
  });

  it("replaces a receivable projection without changing the public event", async () => {
    const signed = await event();
    const run = await replaceLrpProjections(database, {
      receivables: [{
        receivableEventId: signed.id,
        receivableId: "receivable-public-1",
        providerPubkey: signed.pubkey,
        commitmentsByOriginator: {},
        decisionsByClient: {},
        nwcAttestationsByExecutor: {},
      }],
      pools: [],
      eventCount: 1,
      inconsistencies: [],
      projectedAt: new Date("2026-07-21T12:02:00Z"),
    });
    expect(run).toMatchObject({ status: "COMPLETED", receivableCount: 1, poolCount: 0 });
    expect(await database.select().from(schema.lrpReceivableProjections)).toHaveLength(1);
    await clearLrpProjections(database);
    expect(await database.select().from(schema.lrpReceivableProjections)).toHaveLength(0);
    expect(await listLrpPublicEvents(database)).toHaveLength(1);
  });
});
