// @vitest-environment node

import { createHash } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryRelayClient } from "@nostr/relays";
import { FakeSigner } from "@nostr/signer";
import * as schema from "@/db/schema";
import { lrpOriginatorEvents, lrpReceivableProjections, users } from "@/db/schema";
import { confirmReceivable } from "@/db/repositories/receivable-repository";
import { preparePayerCommitmentProof, publishPayerCommitmentProof } from "@/services/lrp-payer-confirmation-service";
import { createPrivateReceivableDraft, prepareReceivableCandidate, publishPreparedReceivable } from "@/services/lrp-receivable-origination-service";
import { evaluateAndPrepareValidationDecision, publishValidationDecision } from "@/services/lrp-validation-decision-service";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-21T12:00:00.000Z");
const dueAt = new Date("2026-08-20T12:00:00.000Z");
const relays = [new InMemoryRelayClient("wss://one.example/"), new InMemoryRelayClient("wss://two.example/"), new InMemoryRelayClient("wss://three.example/")];
const originator = new FakeSigner(new Uint8Array(32).fill(52));

async function setupReceivable(id: string, mode: "SHADOW" | "LRP", condition: "APPROVED" | "REJECTED" | "NEEDS_INFORMATION") {
  await database.insert(users).values({ id, reputationId: crypto.randomUUID(), countryCode: "BR", status: "ACTIVE" });
  const requestKey = crypto.randomUUID();
  const created = await createPrivateReceivableDraft(database, {
    requestKey, requesterId: id, mode, paymentDescription: "Pagamento internacional privado", paymentPurpose: "SERVICE",
    nominalUsdCents: 200_000n, dueAt, payerName: "Pagador Privado", payerCountry: "US", evidenceName: "contrato.pdf",
    evidence: { privateObjectReference: `receivables/${requestKey}/evidence`, sha256: createHash("sha256").update(id).digest("hex"), extension: ".pdf", declaredMimeType: "application/pdf", detectedMimeType: "application/pdf", byteSize: 2048, scanStatus: condition === "REJECTED" ? "PENDING" : "CLEAN" },
    publicPseudonym: "Criadora 52", now, confirmationExpiresAt: new Date("2026-07-23T12:00:00.000Z"), confirmationBaseUrl: "https://example.test",
  });
  const provider = new FakeSigner(new Uint8Array(32).fill(id.length + 60));
  const root = await prepareReceivableCandidate(database, { draftId: created.draftId, requesterId: id, providerPubkey: await provider.getPublicKey() });
  if (mode === "LRP") await publishPreparedReceivable(database, { draftId: created.draftId, requesterId: id, signedEvent: await provider.signEvent(root.candidate!), clients: relays, now });
  await confirmReceivable(database, { rawToken: new URL(created.confirmationUrl!).hash.slice(1), acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
  const originatorPubkey = await originator.getPublicKey();
  const commitment = await preparePayerCommitmentProof(database, { receivableId: created.receivableId, mode, originatorPubkey, now });
  if (mode === "LRP") await publishPayerCommitmentProof(database, { originatorEventId: commitment.originatorEventId, originatorPubkey, signedEvent: await originator.signEvent(commitment.candidate!), clients: relays, now });
  await postgres.query("insert into consents (id, user_id, type, policy_version, granted_at) values ($1, $2, 'IDENTITY_PROCESSING', 'v1', $3)", [`consent-${id}`, id, now]);
  await postgres.query("insert into identity_evidences (id, user_id, type, provider, protected_reference, status, verified_at) values ($1, $2, 'IDENTITY', 'test', $3, 'VERIFIED', $4)", [`identity-${id}`, id, `identity/${id}`, now]);
  await postgres.query("insert into credit_limits (user_id, total_amount, used_amount, rule_version, breakdown) values ($1, 1000000, 0, 'limit-v0.1', '{}')", [id]);
  if (condition === "NEEDS_INFORMATION") {
    const client = await postgres.query<{ client_id: string }>("select client_id from receivables where id = $1", [created.receivableId]);
    await postgres.query("insert into reputation_facts (id, subject_type, subject_id, type, status, evidence_reference, occurred_at) values ($1, 'CLIENT', $2, 'CLIENT_DEFAULTED', 'ACTIVE', $3, $4)", [`default-${id}`, client.rows[0]!.client_id, `default/${id}`, now]);
  }
  return created;
}

describe("decisão do cliente originador no LRP", () => {
  beforeAll(async () => {
    postgres = new PGlite(); database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => postgres.close());

  it.each([
    ["validation-shadow-rejected", "REJECTED"],
    ["validation-shadow-review", "NEEDS_INFORMATION"],
  ] as const)("SHADOW preserva a decisão determinística %s sem publicar", async (id, expected) => {
    const created = await setupReceivable(id, "SHADOW", expected);
    const prepared = await evaluateAndPrepareValidationDecision(database, { receivableId: created.receivableId, mode: "SHADOW", originatorPubkey: await originator.getPublicKey(), now, correlationId: crypto.randomUUID() });
    expect(JSON.parse(prepared.candidate!.content)).toMatchObject({ decision: expected, client_pubkey: await originator.getPublicKey() });
    expect(prepared.status).toBe("SHADOW_VALIDATED");
  });

  it("LRP exige o originador correto, publica com quórum e projeta APPROVED sem criar pool", async () => {
    const created = await setupReceivable("validation-lrp-approved", "LRP", "APPROVED");
    const pubkey = await originator.getPublicKey();
    const prepared = await evaluateAndPrepareValidationDecision(database, { receivableId: created.receivableId, mode: "LRP", originatorPubkey: pubkey, now, correlationId: crypto.randomUUID() });
    const content = JSON.parse(prepared.candidate!.content);
    expect(content).toMatchObject({ event_type: "ClientValidationDecision", decision: "APPROVED", client_pubkey: pubkey, policy_version: "receivable-validation-v1" });
    expect(JSON.stringify(content)).not.toMatch(/Pagador Privado|contrato\.pdf|email|telefone|cpf/i);
    const signed = await originator.signEvent(prepared.candidate!);
    const published = await publishValidationDecision(database, { originatorEventId: prepared.originatorEventId, originatorPubkey: pubkey, signedEvent: signed, clients: relays, now });
    expect(published).toMatchObject({ publicationStatus: "CONFIRMED", status: "PUBLISHED", publicEventId: signed.id });
    const [projection] = await database.select().from(lrpReceivableProjections);
    expect(projection?.projection).toMatchObject({ decisionsByClient: { [pubkey]: [expect.objectContaining({ eventId: signed.id, decision: "APPROVED" })] } });
    const pools = await postgres.query<{ count: number }>("select count(*)::int as count from pools");
    expect(pools.rows[0]?.count).toBe(0);
    expect((await database.select().from(lrpOriginatorEvents)).filter((row) => row.eventType === "ClientValidationDecision")).toHaveLength(3);
  });

  it("rejeita assinatura que não pertence ao originador declarado", async () => {
    const created = await setupReceivable("validation-wrong-signer", "LRP", "APPROVED");
    const pubkey = await originator.getPublicKey();
    const wrong = new FakeSigner(new Uint8Array(32).fill(53));
    const prepared = await evaluateAndPrepareValidationDecision(database, { receivableId: created.receivableId, mode: "LRP", originatorPubkey: pubkey, now, correlationId: crypto.randomUUID() });
    await expect(publishValidationDecision(database, { originatorEventId: prepared.originatorEventId, originatorPubkey: pubkey, signedEvent: await wrong.signEvent(prepared.candidate!), clients: relays, now })).rejects.toThrow("LRP_SIGNED_EVENT_DOES_NOT_MATCH_CANDIDATE");
  });
});
