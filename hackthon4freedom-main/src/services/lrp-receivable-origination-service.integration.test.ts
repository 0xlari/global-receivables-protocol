// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryRelayClient } from "@nostr/relays";
import { FakeSigner } from "@nostr/signer";
import { clearLrpProjections } from "@/db/repositories/lrp-projection-repository";
import * as schema from "@/db/schema";
import { lrpEntityLinks, lrpPublicEvents, lrpPublicationAttempts, lrpReceivableOriginations, lrpReceivableProjections, receivables, users } from "@/db/schema";
import { rebuildLrpProjections } from "@/services/lrp-public-state-service";
import { createPrivateReceivableDraft, prepareReceivableCandidate, publishPreparedReceivable } from "@/services/lrp-receivable-origination-service";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-21T12:00:00.000Z");

async function seedUser(id: string) {
  await database.insert(users).values({ id, reputationId: crypto.randomUUID(), countryCode: "BR", status: "ACTIVE" });
}

function draftInput(userId: string, requestKey: string, mode: "SHADOW" | "LRP") {
  return {
    requestKey, requesterId: userId, mode,
    paymentDescription: "Pagamento internacional de design", paymentPurpose: "SERVICE" as const,
    nominalUsdCents: 200_000n, dueAt: new Date("2026-08-20T12:00:00.000Z"),
    payerName: "Cliente Privado Ltda", payerCountry: "US", evidenceName: "contrato-cliente.pdf",
    evidence: { privateObjectReference: `receivables/${requestKey}/evidence`, sha256: "a".repeat(64), extension: ".pdf", declaredMimeType: "application/pdf", detectedMimeType: "application/pdf", byteSize: 2048, scanStatus: "PENDING" as const },
    publicPseudonym: "Criadora 21", now,
    confirmationExpiresAt: new Date("2026-07-23T12:00:00.000Z"), confirmationBaseUrl: "https://example.test",
  };
}

describe("migração real da criação do recebível para LRP", () => {
  beforeAll(async () => {
    postgres = new PGlite(); database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => postgres.close());

  it("SHADOW persiste o privado, valida candidato e não publica", async () => {
    await seedUser("shadow-user");
    const created = await createPrivateReceivableDraft(database, draftInput("shadow-user", crypto.randomUUID(), "SHADOW"));
    const prepared = await prepareReceivableCandidate(database, { draftId: created.draftId, requesterId: "shadow-user" });
    expect(prepared.status).toBe("SHADOW_VALIDATED");
    expect(prepared.divergences).toEqual(["PUBLIC_TITLE_REDACTED", "PROVIDER_SIGNER_NOT_LINKED"]);
    expect(prepared.candidate).toBeDefined();
    expect(await database.select().from(lrpPublicEvents)).toHaveLength(0);
    expect(await database.select().from(lrpEntityLinks)).toHaveLength(0);
    const [stored] = await database.select().from(lrpReceivableOriginations).where(eq(lrpReceivableOriginations.id, created.draftId));
    expect(stored?.canonicalSource).toBe("LEGACY");
  });

  it("mantém draft privado sem signer e não duplica retry", async () => {
    await seedUser("draft-user"); const requestKey = crypto.randomUUID();
    const first = await createPrivateReceivableDraft(database, draftInput("draft-user", requestKey, "LRP"));
    const retry = await createPrivateReceivableDraft(database, draftInput("draft-user", requestKey, "LRP"));
    expect(first.status).toBe("PRIVATE_DRAFT");
    expect(retry).toMatchObject({ duplicate: true, receivableId: first.receivableId });
    expect(await database.select().from(receivables).where(eq(receivables.requesterId, "draft-user"))).toHaveLength(1);
    expect(await database.select().from(lrpPublicEvents)).toHaveLength(0);
  });

  it("LRP preserva o event ID no retry, vincula o privado e reconstrói a projeção", async () => {
    await seedUser("lrp-user");
    const signer = new FakeSigner(new Uint8Array(32).fill(7)); const pubkey = await signer.getPublicKey();
    const created = await createPrivateReceivableDraft(database, draftInput("lrp-user", crypto.randomUUID(), "LRP"));
    const prepared = await prepareReceivableCandidate(database, { draftId: created.draftId, requesterId: "lrp-user", providerPubkey: pubkey });
    const signed = await signer.signEvent(prepared.candidate!);
    const relayA = new InMemoryRelayClient("wss://relay-a.example/");
    const timeoutB = new InMemoryRelayClient("wss://relay-b.example/", "TIMEOUT");
    const timeoutC = new InMemoryRelayClient("wss://relay-c.example/", "TIMEOUT");
    const pending = await publishPreparedReceivable(database, { draftId: created.draftId, requesterId: "lrp-user", signedEvent: signed, clients: [relayA, timeoutB, timeoutC], now });
    expect(pending).toMatchObject({ publicationStatus: "INSUFFICIENT_ACKS", status: "PUBLICATION_PENDING", publicEventId: signed.id });
    expect(await database.select().from(lrpEntityLinks)).toHaveLength(0);

    const relayB = new InMemoryRelayClient("wss://relay-b.example/");
    const confirmed = await publishPreparedReceivable(database, { draftId: created.draftId, requesterId: "lrp-user", clients: [relayA, relayB, timeoutC], now: new Date(now.getTime() + 1000) });
    expect(confirmed).toMatchObject({ publicationStatus: "CONFIRMED", status: "PUBLISHED", publicEventId: signed.id });
    const [publication] = await database.select().from(lrpPublicationAttempts);
    expect(publication).toMatchObject({ eventId: signed.id, attemptCount: 4, status: "CONFIRMED" });
    const [link] = await database.select().from(lrpEntityLinks);
    expect(link).toMatchObject({ privateEntityId: created.receivableId, eventId: signed.id, canonicalSource: "LRP" });
    expect(await database.select().from(lrpReceivableProjections)).toHaveLength(1);
    const serialized = JSON.stringify(signed);
    expect(serialized).not.toContain("Cliente Privado"); expect(serialized).not.toContain("contrato-cliente.pdf");
    expect(serialized).not.toMatch(/cpf|email|telefone|documento/i);

    await clearLrpProjections(database);
    expect(await database.select().from(lrpReceivableProjections)).toHaveLength(0);
    const rebuilt = await rebuildLrpProjections(database, [relayA, relayB, timeoutC], new Date(now.getTime() + 2000));
    expect(rebuilt.receivables).toHaveLength(1);
    expect(await database.select().from(lrpReceivableProjections)).toHaveLength(1);
  });

  it("recusa assinatura de outra pubkey sem publicar", async () => {
    await seedUser("wrong-signer-user");
    const expected = new FakeSigner(new Uint8Array(32).fill(8)); const wrong = new FakeSigner(new Uint8Array(32).fill(9));
    const created = await createPrivateReceivableDraft(database, draftInput("wrong-signer-user", crypto.randomUUID(), "LRP"));
    const prepared = await prepareReceivableCandidate(database, { draftId: created.draftId, requesterId: "wrong-signer-user", providerPubkey: await expected.getPublicKey() });
    const signed = await wrong.signEvent(prepared.candidate!);
    const relays = [new InMemoryRelayClient("wss://one.example/"), new InMemoryRelayClient("wss://two.example/"), new InMemoryRelayClient("wss://three.example/")];
    await expect(publishPreparedReceivable(database, { draftId: created.draftId, requesterId: "wrong-signer-user", signedEvent: signed, clients: relays, now })).rejects.toThrow("LRP_SIGNED_EVENT_DOES_NOT_MATCH_CANDIDATE");
    expect(await database.select().from(lrpPublicEvents).where(eq(lrpPublicEvents.eventId, signed.id))).toHaveLength(0);
  });
});
