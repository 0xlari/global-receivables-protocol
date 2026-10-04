// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryRelayClient } from "@nostr/relays";
import { FakeSigner } from "@nostr/signer";
import * as schema from "@/db/schema";
import { lrpOriginatorEvents, lrpPublicEvents, lrpReceivableProjections, users } from "@/db/schema";
import { confirmReceivable } from "@/db/repositories/receivable-repository";
import { clearLrpProjections } from "@/db/repositories/lrp-projection-repository";
import { preparePayerCommitmentProof, publishPayerCommitmentProof } from "@/services/lrp-payer-confirmation-service";
import { createPrivateReceivableDraft, prepareReceivableCandidate, publishPreparedReceivable } from "@/services/lrp-receivable-origination-service";
import { rebuildLrpProjections } from "@/services/lrp-public-state-service";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-21T12:00:00.000Z");
const dueAt = new Date("2026-08-20T12:00:00.000Z");

async function seedUser(id: string) {
  await database.insert(users).values({ id, reputationId: crypto.randomUUID(), countryCode: "BR", status: "ACTIVE" });
}

function draftInput(userId: string, mode: "SHADOW" | "LRP") {
  const requestKey = crypto.randomUUID();
  return {
    requestKey, requesterId: userId, mode,
    paymentDescription: "Contrato privado Cliente Confidencial", paymentPurpose: "SERVICE" as const,
    nominalUsdCents: 200_000n, dueAt, payerName: "Cliente Confidencial Ltda", payerCountry: "US",
    evidenceName: "contrato-confidencial.pdf", publicPseudonym: "Criadora 21", now,
    evidence: { privateObjectReference: `receivables/${requestKey}/evidence`, sha256: "a".repeat(64), extension: ".pdf", declaredMimeType: "application/pdf", detectedMimeType: "application/pdf", byteSize: 2048, scanStatus: "PENDING" as const },
    confirmationExpiresAt: new Date("2026-07-23T12:00:00.000Z"), confirmationBaseUrl: "https://example.test",
  };
}

async function createAndConfirm(userId: string, mode: "SHADOW" | "LRP") {
  await seedUser(userId);
  const draft = await createPrivateReceivableDraft(database, draftInput(userId, mode));
  const provider = new FakeSigner(new Uint8Array(32).fill(mode === "LRP" ? 41 : 42));
  const prepared = await prepareReceivableCandidate(database, { draftId: draft.draftId, requesterId: userId, providerPubkey: await provider.getPublicKey() });
  const relays = [new InMemoryRelayClient("wss://one.example/"), new InMemoryRelayClient("wss://two.example/"), new InMemoryRelayClient("wss://three.example/")];
  if (mode === "LRP") {
    await publishPreparedReceivable(database, { draftId: draft.draftId, requesterId: userId, signedEvent: await provider.signEvent(prepared.candidate!), clients: relays, now });
  }
  await confirmReceivable(database, {
    rawToken: new URL(draft.confirmationUrl!).hash.slice(1), acceptsBtc: true, confirmsDescription: true,
    confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now,
  });
  return { draft, relays };
}

describe("migração da confirmação do pagador para LRP", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => postgres.close());

  it("SHADOW cria e valida candidato sem publicar dados privados", async () => {
    const { draft } = await createAndConfirm("payer-shadow", "SHADOW");
    const prepared = await preparePayerCommitmentProof(database, { receivableId: draft.receivableId, mode: "SHADOW", now, originatorPubkey: "b".repeat(64) });
    expect(prepared.status).toBe("SHADOW_VALIDATED");
    expect(prepared.divergences).toEqual(["LEGACY_CONFIRMATION_REMAINS_CANONICAL"]);
    expect(await database.select().from(lrpPublicEvents)).toHaveLength(0);
    const serialized = JSON.stringify(prepared.candidate);
    expect(serialized).not.toContain("Cliente Confidencial");
    expect(serialized).not.toContain("contrato-confidencial.pdf");
  });

  it("LRP reutiliza o mesmo event ID, exige quórum e reconstrói a projeção", async () => {
    const { draft, relays } = await createAndConfirm("payer-lrp", "LRP");
    const originator = new FakeSigner(new Uint8Array(32).fill(43));
    const pubkey = await originator.getPublicKey();
    const prepared = await preparePayerCommitmentProof(database, { receivableId: draft.receivableId, mode: "LRP", now, originatorPubkey: pubkey });
    const signed = await originator.signEvent(prepared.candidate!);
    const pendingRelays = [relays[0]!, new InMemoryRelayClient("wss://four.example/", "TIMEOUT"), new InMemoryRelayClient("wss://five.example/", "TIMEOUT")];
    const pending = await publishPayerCommitmentProof(database, { originatorEventId: prepared.originatorEventId, originatorPubkey: pubkey, signedEvent: signed, clients: pendingRelays, now });
    expect(pending).toMatchObject({ publicationStatus: "INSUFFICIENT_ACKS", status: "PUBLICATION_PENDING", publicEventId: signed.id });
    const confirmed = await publishPayerCommitmentProof(database, { originatorEventId: prepared.originatorEventId, originatorPubkey: pubkey, clients: relays, now: new Date(now.getTime() + 1000) });
    expect(confirmed).toMatchObject({ publicationStatus: "CONFIRMED", status: "PUBLISHED", publicEventId: signed.id });
    const [stored] = await database.select().from(lrpOriginatorEvents).where(eq(lrpOriginatorEvents.id, prepared.originatorEventId));
    expect(stored).toMatchObject({ canonicalSource: "LRP", publicEventId: signed.id });
    const content = JSON.parse(signed.content);
    expect(content).toMatchObject({ event_type: "PayerCommitmentProof", receivable_event_id: expect.stringMatching(/^[a-f0-9]{64}$/), originator_pubkey: pubkey });
    expect(JSON.stringify(signed)).not.toMatch(/Cliente Confidencial|contrato-confidencial|email|telefone|cpf/i);

    await clearLrpProjections(database);
    await rebuildLrpProjections(database, relays, new Date(now.getTime() + 2000));
    const [projection] = await database.select().from(lrpReceivableProjections);
    expect(projection?.projection).toMatchObject({ commitmentsByOriginator: { [pubkey]: [signed.id] } });
  });

  it("rejeita assinatura de outra pubkey sem publicar", async () => {
    const { draft, relays } = await createAndConfirm("payer-wrong", "LRP");
    const expected = new FakeSigner(new Uint8Array(32).fill(44));
    const wrong = new FakeSigner(new Uint8Array(32).fill(45));
    const prepared = await preparePayerCommitmentProof(database, { receivableId: draft.receivableId, mode: "LRP", now, originatorPubkey: await expected.getPublicKey() });
    await expect(publishPayerCommitmentProof(database, { originatorEventId: prepared.originatorEventId, originatorPubkey: await expected.getPublicKey(), signedEvent: await wrong.signEvent(prepared.candidate!), clients: relays, now })).rejects.toThrow("LRP_SIGNED_EVENT_DOES_NOT_MATCH_CANDIDATE");
  });
});
