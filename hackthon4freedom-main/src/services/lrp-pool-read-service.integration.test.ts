// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryRelayClient } from "@nostr/relays";
import { FakeSigner } from "@nostr/signer";
import { buildProtocolEvent } from "@protocol/builders";
import type { ProtocolKind } from "@protocol/kinds";
import type { ProtocolContent } from "@protocol/schemas";
import { validContentVectors } from "@protocol/test-vectors/valid";
import { clearLrpProjections } from "@/db/repositories/lrp-projection-repository";
import * as schema from "@/db/schema";
import { rebuildLrpProjections } from "./lrp-public-state-service";
import { evaluateLrpPoolProjection, readLrpPoolProjections } from "./lrp-pool-read-service";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;

async function poolGraph() {
  const provider = new FakeSigner(new Uint8Array(32).fill(41));
  const originator = new FakeSigner(new Uint8Array(32).fill(42));
  const providerPubkey = await provider.getPublicKey();
  const originatorPubkey = await originator.getPublicKey();
  const sign = async (index: number, signer: FakeSigner, overrides: Record<string, unknown> = {}) => {
    const vector = validContentVectors[index]!;
    const content = { ...vector.content, ...overrides } as ProtocolContent;
    if (content.event_type === "ReceivableCreated") content.provider_pubkey = providerPubkey;
    if (content.event_type === "ClientValidationDecision") content.client_pubkey = originatorPubkey;
    if (content.event_type === "NwcAuthorizationAttestation") content.executor_pubkey = originatorPubkey;
    return signer.signEvent(buildProtocolEvent(vector.kind as ProtocolKind, content));
  };
  const receivable = await sign(1, provider);
  const commitment = await sign(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey });
  const approval = await sign(3, originator, { receivable_event_id: receivable.id });
  const nwc = await sign(4, originator, { receivable_event_id: receivable.id });
  const pool = await sign(5, provider, {
    receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id,
    approval_event_id: approval.id, nwc_attestation_event_id: nwc.id,
    originator_pubkey: originatorPubkey,
  });
  return { events: [receivable, commitment, approval, nwc, pool], pool };
}

describe("LRP pool read model", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => { await postgres.close(); });

  it("lê por projeção, rejeita quórum insuficiente e restaura o mesmo event ID no rebuild", async () => {
    const graph = await poolGraph();
    const relays = [
      new InMemoryRelayClient("wss://read-one.example/"),
      new InMemoryRelayClient("wss://read-two.example/"),
      new InMemoryRelayClient("wss://read-three.example/"),
    ];
    for (const event of graph.events) {
      await relays[0]!.publish(event);
      await relays[1]!.publish(event);
    }
    await rebuildLrpProjections(database, relays, new Date("2027-01-15T08:00:00.000Z"));
    const ready = await readLrpPoolProjections(database, { now: new Date("2027-01-15T08:01:00.000Z") });
    expect(ready).toMatchObject({ status: "READY", pools: [{ eventId: graph.pool.id, verified: true, relayConfirmations: 2 }] });
    expect(JSON.stringify(ready)).not.toMatch(/cpf|email|telefone|nostr\+walletconnect|preimage|invoice|documento/i);

    await database.update(schema.lrpPublicEvents).set({ observedRelays: ["wss://read-one.example/"] });
    const insufficient = await readLrpPoolProjections(database, { now: new Date("2027-01-15T08:01:00.000Z") });
    expect(insufficient).toMatchObject({ status: "DEGRADED", pools: [], issues: ["RELAY_QUORUM_INSUFFICIENT"] });

    await clearLrpProjections(database);
    expect(await readLrpPoolProjections(database, { poolId: "pool_demo_00000001" })).toMatchObject({ issues: ["PROJECTION_NOT_FOUND"] });
    await rebuildLrpProjections(database, relays, new Date("2027-01-15T08:02:00.000Z"));
    const restored = await readLrpPoolProjections(database, { poolId: "pool_demo_00000001", now: new Date("2027-01-15T08:03:00.000Z") });
    expect(restored.pools[0]?.eventId).toBe(graph.pool.id);
  }, 30_000);

  it("marca projeção stale e rebuild em andamento explicitamente", async () => {
    const stale = await readLrpPoolProjections(database, { now: new Date("2027-01-16T08:03:00.000Z") });
    expect(stale.issues).toContain("PROJECTION_STALE");
    await database.insert(schema.lrpProjectionRuns).values({ id: crypto.randomUUID(), status: "RUNNING", startedAt: new Date("2027-01-16T08:04:00.000Z") });
    const rebuilding = await readLrpPoolProjections(database, { now: new Date("2027-01-16T08:04:01.000Z") });
    expect(rebuilding).toMatchObject({ status: "REBUILDING" });
    expect(rebuilding.issues).toContain("REBUILD_IN_PROGRESS");
  });

  it("expõe estados de cache ausente, grafo inválido, conflito e banco indisponível", async () => {
    const [projection] = await database.select().from(schema.lrpPoolProjections);
    const [event] = await database.select().from(schema.lrpPublicEvents).where(eq(schema.lrpPublicEvents.eventId, projection!.poolEventId));
    const missing = evaluateLrpPoolProjection({ projection: projection!, now: new Date("2027-01-16T08:04:01.000Z") });
    expect(missing.issues).toContain("CANONICAL_EVENT_MISSING");
    const invalid = evaluateLrpPoolProjection({ projection: projection!, event: { ...event!, signature: "0".repeat(128) }, now: new Date("2027-01-16T08:04:01.000Z"), runInconsistencies: [{ eventId: projection!.poolEventId, reason: "AMBIGUOUS_TRANSITION_BRANCH" }] });
    expect(invalid.issues).toEqual(expect.arrayContaining(["INVALID_EVENT_GRAPH", "REDUCER_CONFLICT"]));
    const unavailable = await readLrpPoolProjections({ select: () => { throw new Error("offline"); } } as never);
    expect(unavailable).toEqual({ status: "UNAVAILABLE", pools: [], issues: ["DATABASE_UNAVAILABLE"] });
  });
});
