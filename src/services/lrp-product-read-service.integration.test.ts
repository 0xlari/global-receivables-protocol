// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryRelayClient } from "@nostr/relays";
import { FakeSigner } from "@nostr/signer";
import * as schema from "@/db/schema";
import { receivables, users } from "@/db/schema";
import {
  createPrivateReceivableDraft,
  prepareReceivableCandidate,
  publishPreparedReceivable,
} from "@/services/lrp-receivable-origination-service";
import { readLrpProductJourney } from "@/services/lrp-product-read-service";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-21T12:00:00.000Z");

async function seedUser(id: string) {
  await database.insert(users).values({ id, reputationId: crypto.randomUUID(), countryCode: "BR", status: "ACTIVE" });
}

function draftInput(requesterId: string) {
  const requestKey = crypto.randomUUID();
  return {
    requestKey,
    requesterId,
    mode: "LRP" as const,
    paymentDescription: "Consultoria internacional",
    paymentPurpose: "SERVICE" as const,
    nominalUsdCents: 125_000n,
    dueAt: new Date("2026-08-20T12:00:00.000Z"),
    payerName: "Empresa privada",
    payerCountry: "US",
    evidenceName: "contrato-privado.pdf",
    evidence: {
      privateObjectReference: `receivables/${requestKey}/evidence`,
      sha256: "a".repeat(64),
      extension: ".pdf",
      declaredMimeType: "application/pdf",
      detectedMimeType: "application/pdf",
      byteSize: 512,
      scanStatus: "PENDING" as const,
    },
    publicPseudonym: "Criadora 42",
    now,
    confirmationExpiresAt: new Date("2026-07-23T12:00:00.000Z"),
    confirmationBaseUrl: "https://produto.test",
  };
}

describe("leitura autenticada da jornada LRP", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
    await seedUser("wallet-owner-a");
    await seedUser("wallet-owner-b");
  }, 30_000);

  afterAll(async () => { await postgres.close(); });

  it("retoma draft, candidato e publicação pendente sem trocar o event ID", async () => {
    const created = await createPrivateReceivableDraft(database, draftInput("wallet-owner-a"));
    const draft = await readLrpProductJourney(database, { requesterId: "wallet-owner-a", mode: "LRP" });
    expect(draft.active).toMatchObject({
      draftId: created.draftId,
      privateStatus: "AWAITING_CLIENT",
      originationStatus: "PRIVATE_DRAFT",
      nextStep: "CONNECT_IDENTITY",
    });
    expect(draft.active?.confirmationUrl).toMatch(/^https:\/\/produto\.test\/confirmar#[A-Za-z0-9_-]+$/);

    const signer = new FakeSigner(new Uint8Array(32).fill(17));
    const prepared = await prepareReceivableCandidate(database, {
      draftId: created.draftId,
      requesterId: "wallet-owner-a",
      providerPubkey: await signer.getPublicKey(),
    });
    const preparedCandidate = structuredClone(prepared.candidate!);
    const candidate = await readLrpProductJourney(database, { requesterId: "wallet-owner-a", mode: "LRP" });
    expect(candidate.active).toMatchObject({ originationStatus: "CANDIDATE_READY", nextStep: "SIGN_RECEIVABLE" });
    expect(candidate.active?.candidate).toEqual(preparedCandidate);

    const signed = await signer.signEvent(prepared.candidate!);
    await publishPreparedReceivable(database, {
      draftId: created.draftId,
      requesterId: "wallet-owner-a",
      signedEvent: signed,
      clients: [
        new InMemoryRelayClient("wss://one.example/"),
        new InMemoryRelayClient("wss://two.example/", "TIMEOUT"),
        new InMemoryRelayClient("wss://three.example/", "TIMEOUT"),
      ],
      now,
    });
    const pending = await readLrpProductJourney(database, { requesterId: "wallet-owner-a", mode: "LRP" });
    expect(pending.active).toMatchObject({
      originationStatus: "PUBLICATION_PENDING",
      publicationStatus: "PENDING",
      publicEventId: signed.id,
      nextStep: "RETRY_PUBLICATION",
    });
    expect(pending.active?.candidate).toEqual(preparedCandidate);
    expect(JSON.stringify(pending)).not.toContain("Empresa privada");
    expect(JSON.stringify(pending)).not.toContain("contrato-privado.pdf");
  }, 30_000);

  it("isola perfis e deixa recebível rejeitado apenas no histórico", async () => {
    expect(await readLrpProductJourney(database, { requesterId: "wallet-owner-b", mode: "LRP" }))
      .toEqual({ active: undefined, history: [] });

    await database.update(receivables).set({ status: "REJECTED" }).where(eq(receivables.requesterId, "wallet-owner-a"));
    const rejected = await readLrpProductJourney(database, { requesterId: "wallet-owner-a", mode: "LRP" });
    expect(rejected.active).toBeUndefined();
    expect(rejected.history).toEqual([expect.objectContaining({ privateStatus: "REJECTED" })]);
  });
});
