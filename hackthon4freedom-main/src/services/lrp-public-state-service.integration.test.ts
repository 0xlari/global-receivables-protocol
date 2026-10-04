// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FakeSigner } from "@nostr/signer";
import type { ProtocolRelayClient, RelayFilter } from "@nostr/relays";
import { buildReceivableCreated } from "@protocol/builders";
import type { ProtocolSignedEvent } from "@protocol/schemas";
import { LRP_EVENT_VERSION } from "@protocol/version";
import { clearLrpProjections } from "@/db/repositories/lrp-projection-repository";
import * as schema from "@/db/schema";
import {
  publishAndProjectLrpEvent,
  rebuildLrpProjections,
} from "./lrp-public-state-service";

class SequencedRelay implements ProtocolRelayClient {
  readonly events = new Map<string, ProtocolSignedEvent>();
  publishCalls = 0;

  constructor(readonly relayUrl: string, private readonly acknowledgeAt: number) {}

  async publish(event: ProtocolSignedEvent) {
    this.publishCalls += 1;
    const accepted = this.publishCalls >= this.acknowledgeAt;
    if (accepted) this.events.set(event.id, structuredClone(event));
    return { accepted };
  }

  async query(filter: RelayFilter) {
    return [...this.events.values()].filter((event) =>
      (!filter.kinds || filter.kinds.includes(event.kind)) &&
      (!filter.eventIds || filter.eventIds.includes(event.id)),
    ).map((event) => structuredClone(event));
  }
}

let postgres: PGlite;
let database: PgliteDatabase<typeof schema>;
const signer = new FakeSigner(new Uint8Array(32).fill(32));

async function receivableEvent(receivableId = "public-receivable-service") {
  const pubkey = await signer.getPublicKey();
  return signer.signEvent(buildReceivableCreated({
    protocol_version: LRP_EVENT_VERSION,
    event_type: "ReceivableCreated",
    receivable_id: receivableId,
    title: "Pagamento internacional",
    provider_pseudonym: "Criadora 32",
    provider_pubkey: pubkey,
    nominal_amount_minor: "25000",
    original_currency: "USD",
    due_at: 1_800_086_400,
    category: "SERVICE",
    country: "BR",
    private_evidence_hash: "b".repeat(64),
    receivable_version: 1,
    created_at: 1_800_000_000,
  }));
}

describe("LRP public state service", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);

  afterAll(async () => { await postgres.close(); });

  it("keeps relay publication disabled outside explicit LRP mode", async () => {
    const event = await receivableEvent("legacy-disabled-1");
    await expect(publishAndProjectLrpEvent(database, {
      mode: "LEGACY",
      event,
      entityType: "RECEIVABLE",
      privateEntityId: "private-disabled",
      idempotencyKey: "receivable:private-disabled:created",
      clients: [],
    })).rejects.toThrow("LRP_PUBLICATION_DISABLED");
    expect(await database.select().from(schema.lrpPublicEvents)).toHaveLength(0);
  });

  it("publishes the same event id, links it and rebuilds its projection", async () => {
    const event = await receivableEvent();
    const relays = [
      new SequencedRelay("wss://one.example/", 1),
      new SequencedRelay("wss://two.example/", 2),
      new SequencedRelay("wss://three.example/", 99),
    ];
    const first = await publishAndProjectLrpEvent(database, {
      mode: "LRP",
      event,
      entityType: "RECEIVABLE",
      privateEntityId: "private-service",
      idempotencyKey: "receivable:private-service:created",
      clients: relays,
      maxAttempts: 3,
      now: new Date("2026-07-21T13:00:00Z"),
    });
    expect(first.status).toBe("CONFIRMED");
    expect(first.attempts).toHaveLength(2);
    expect(relays.flatMap((relay) => [...relay.events.keys()]).every((id) => id === event.id)).toBe(true);
    expect(await database.select().from(schema.lrpEntityLinks)).toHaveLength(1);
    expect(await database.select().from(schema.lrpReceivableProjections)).toHaveLength(1);
    const [publication] = await database.select().from(schema.lrpPublicationAttempts);
    expect(publication).toMatchObject({ eventId: event.id, status: "CONFIRMED", attemptCount: 2 });

    await database.delete(schema.lrpEntityLinks);
    const callsBeforeRetry = relays.map((relay) => relay.publishCalls);
    const retry = await publishAndProjectLrpEvent(database, {
      mode: "LRP",
      event,
      entityType: "RECEIVABLE",
      privateEntityId: "private-service",
      idempotencyKey: "receivable:private-service:created",
      clients: relays,
      now: new Date("2026-07-21T13:01:00Z"),
    });
    expect(retry).toMatchObject({ status: "CONFIRMED", duplicate: true, attempts: [] });
    expect(relays.map((relay) => relay.publishCalls)).toEqual(callsBeforeRetry);
    expect(await database.select().from(schema.lrpEntityLinks)).toHaveLength(1);

    await clearLrpProjections(database);
    expect(await database.select().from(schema.lrpReceivableProjections)).toHaveLength(0);
    const rebuilt = await rebuildLrpProjections(database, relays, new Date("2026-07-21T13:02:00Z"));
    expect(rebuilt).toMatchObject({ run: { status: "COMPLETED", eventCount: 1, receivableCount: 1 } });
    expect(await database.select().from(schema.lrpReceivableProjections)).toHaveLength(1);
  });

  it("keeps a signed event pending without linking when quorum is insufficient", async () => {
    const event = await receivableEvent("insufficient-quorum");
    const result = await publishAndProjectLrpEvent(database, {
      mode: "LRP",
      event,
      entityType: "RECEIVABLE",
      privateEntityId: "private-insufficient",
      idempotencyKey: "receivable:private-insufficient:created",
      clients: [
        new SequencedRelay("wss://four.example/", 1),
        new SequencedRelay("wss://five.example/", 99),
        new SequencedRelay("wss://six.example/", 99),
      ],
      maxAttempts: 2,
      now: new Date("2026-07-21T13:03:00Z"),
    });
    expect(result.status).toBe("INSUFFICIENT_ACKS");
    const links = await database.select().from(schema.lrpEntityLinks);
    expect(links.some((link) => link.privateEntityId === "private-insufficient")).toBe(false);
    const [stored] = (await database.select().from(schema.lrpPublicEvents)).filter((item) => item.eventId === event.id);
    expect(stored).toMatchObject({ eventId: event.id, observedRelays: ["wss://four.example/"] });
  });
});
