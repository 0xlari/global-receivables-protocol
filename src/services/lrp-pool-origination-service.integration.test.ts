// @vitest-environment node

import { createHash, randomBytes } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryRelayClient } from "@nostr/relays";
import { FakeSigner } from "@nostr/signer";
import { validatePoolCreationGraph } from "@protocol/validators";
import * as schema from "@/db/schema";
import { contributionIntents, contributions, lrpOriginatorEvents, lrpPoolProjections, lrpPublicEvents, nwcConnections, payerPaymentAuthorizations, pools, users } from "@/db/schema";
import { clearLrpProjections } from "@/db/repositories/lrp-projection-repository";
import { connectNwcAuthorization, createPayerPaymentAuthorization } from "@/db/repositories/payer-payment-repository";
import { confirmReceivable } from "@/db/repositories/receivable-repository";
import { FakeNwcGateway } from "@/integrations/nwc/fake-gateway";
import { prepareNwcAuthorizationAttestation, publishNwcAuthorizationAttestation } from "@/services/lrp-nwc-attestation-service";
import { acceptAndPreparePoolCreated, previewPoolCreated, publishPreparedPoolCreated } from "@/services/lrp-pool-origination-service";
import { preparePayerCommitmentProof, publishPayerCommitmentProof } from "@/services/lrp-payer-confirmation-service";
import { rebuildLrpProjections } from "@/services/lrp-public-state-service";
import { createPrivateReceivableDraft, prepareReceivableCandidate, publishPreparedReceivable } from "@/services/lrp-receivable-origination-service";
import { evaluateAndPrepareValidationDecision, publishValidationDecision } from "@/services/lrp-validation-decision-service";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-21T12:00:00.000Z");
const dueAt = new Date("2026-08-20T12:00:00.000Z");
const originator = new FakeSigner(new Uint8Array(32).fill(91));

async function setup(id: string, mode: "SHADOW" | "LRP", approved = true) {
  const relays = [new InMemoryRelayClient(`wss://${id}-one.example/`), new InMemoryRelayClient(`wss://${id}-two.example/`), new InMemoryRelayClient(`wss://${id}-three.example/`)];
  await database.insert(users).values({ id, reputationId: crypto.randomUUID(), countryCode: "BR", status: "ACTIVE" });
  const requestKey = crypto.randomUUID();
  const created = await createPrivateReceivableDraft(database, {
    requestKey, requesterId: id, mode, paymentDescription: "Contrato comercial confidencial", paymentPurpose: "SERVICE",
    nominalUsdCents: 200_000n, dueAt, payerName: "Cliente Privado", payerCountry: "US", evidenceName: "contrato-secreto.pdf",
    evidence: { privateObjectReference: `private/${requestKey}`, sha256: createHash("sha256").update(id).digest("hex"), extension: ".pdf", declaredMimeType: "application/pdf", detectedMimeType: "application/pdf", byteSize: 2000, scanStatus: approved ? "CLEAN" : "PENDING" },
    publicPseudonym: "Criadora 91", now, confirmationExpiresAt: new Date("2026-07-23T12:00:00.000Z"), confirmationBaseUrl: "https://example.test",
  });
  const provider = new FakeSigner(new Uint8Array(32).fill(id.length + 101));
  const root = await prepareReceivableCandidate(database, { draftId: created.draftId, requesterId: id, providerPubkey: await provider.getPublicKey() });
  const rootPublished = mode === "LRP" ? await publishPreparedReceivable(database, { draftId: created.draftId, requesterId: id, signedEvent: await provider.signEvent(root.candidate!), clients: relays, now }) : undefined;
  const rawToken = new URL(created.confirmationUrl!).hash.slice(1);
  await confirmReceivable(database, { rawToken, acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
  const authorization = await createPayerPaymentAuthorization(database, { receivableId: created.receivableId, rawConfirmationToken: rawToken, method: "NWC_AUTOMATIC", maxAmountMsat: 30_000_000n, maxFeeMsat: 10_000n, now });
  const secret = createHash("sha256").update(id).digest("hex");
  await connectNwcAuthorization(database, new FakeNwcGateway(), { publicId: authorization.publicId, managementToken: authorization.managementToken, nwcUri: `nostr+walletconnect://${"c".repeat(64)}?relay=${encodeURIComponent("wss://private-relay.example/")}&secret=${secret}`, now, protectRelayMetadata: true });
  const [privateAuthorization] = await database.select().from(payerPaymentAuthorizations).where(eq(payerPaymentAuthorizations.receivableId, created.receivableId));
  const originatorPubkey = await originator.getPublicKey();
  const commitment = await preparePayerCommitmentProof(database, { receivableId: created.receivableId, mode, originatorPubkey, now });
  const commitmentPublished = mode === "LRP" ? await publishPayerCommitmentProof(database, { originatorEventId: commitment.originatorEventId, originatorPubkey, signedEvent: await originator.signEvent(commitment.candidate!), clients: relays, now }) : undefined;
  await postgres.query("insert into consents (id, user_id, type, policy_version, granted_at) values ($1, $2, 'IDENTITY_PROCESSING', 'v1', $3)", [`consent-${id}`, id, now]);
  await postgres.query("insert into identity_evidences (id, user_id, type, provider, protected_reference, status, verified_at) values ($1, $2, 'IDENTITY', 'test', $3, 'VERIFIED', $4)", [`identity-${id}`, id, `identity/${id}`, now]);
  await postgres.query("insert into credit_limits (user_id, total_amount, used_amount, rule_version, breakdown) values ($1, 1000000, 0, 'limit-v0.1', '{}')", [id]);
  const decision = await evaluateAndPrepareValidationDecision(database, { receivableId: created.receivableId, mode, originatorPubkey, now, correlationId: crypto.randomUUID() });
  const decisionPublished = mode === "LRP" ? await publishValidationDecision(database, { originatorEventId: decision.originatorEventId, originatorPubkey, signedEvent: await originator.signEvent(decision.candidate!), clients: relays, now }) : undefined;
  const nwc = await prepareNwcAuthorizationAttestation(database, { receivableId: created.receivableId, mode, originatorPubkey, now });
  const nwcPublished = mode === "LRP" ? await publishNwcAuthorizationAttestation(database, { originatorEventId: nwc.originatorEventId, originatorPubkey, signedEvent: await originator.signEvent(nwc.candidate!), clients: relays, now }) : undefined;
  return { id, mode, relays, provider, created, authorization, authorizationId: privateAuthorization!.id, root, rootPublished, commitment, commitmentPublished, decision, decisionPublished, nwc, nwcPublished };
}

describe("originação real de PoolCreated", () => {
  beforeAll(async () => {
    process.env.NWC_CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    postgres = new PGlite(); database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => { delete process.env.NWC_CONNECTION_ENCRYPTION_KEY; await postgres.close(); });

  it("LRP valida o grafo completo, mantém o event ID no retry 1/3 -> 2/3 e reconstrói a projeção", async () => {
    const state = await setup("pool-valid", "LRP");
    const preview = await previewPoolCreated(database, { receivableId: state.created.receivableId, requesterId: state.id, mode: "LRP", now });
    const prepared = await acceptAndPreparePoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: state.id, termsHash: preview.termsHash, consent: true, now });
    const signed = await state.provider.signEvent(prepared.candidate!);
    const graph = [state.rootPublished!.event, state.commitmentPublished!.event, state.decisionPublished!.event, state.nwcPublished!.event];
    expect(validatePoolCreationGraph(signed, graph)).toMatchObject({ valid: true });
    for (const missing of graph) expect(validatePoolCreationGraph(signed, graph.filter((event) => event.id !== missing.id))).toMatchObject({ valid: false });
    const pending = await publishPreparedPoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: state.id, signedEvent: signed, clients: [state.relays[0]!, new InMemoryRelayClient(state.relays[1]!.relayUrl, "TIMEOUT"), new InMemoryRelayClient(state.relays[2]!.relayUrl, "TIMEOUT")], now });
    expect(pending).toMatchObject({ publicationStatus: "INSUFFICIENT_ACKS", publicEventId: signed.id });
    expect(await database.select().from(pools).where(eq(pools.receivableId, state.created.receivableId))).toHaveLength(0);
    const confirmed = await publishPreparedPoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: state.id, clients: [state.relays[0]!, state.relays[1]!, new InMemoryRelayClient(state.relays[2]!.relayUrl, "TIMEOUT")], now: new Date(now.getTime() + 1000) });
    expect(confirmed).toMatchObject({ publicationStatus: "CONFIRMED", status: "PUBLISHED", publicEventId: signed.id });
    expect(await database.select().from(pools).where(eq(pools.receivableId, state.created.receivableId))).toHaveLength(1);
    expect(await database.select().from(contributionIntents)).toHaveLength(0); expect(await database.select().from(contributions)).toHaveLength(0);
    expect(JSON.stringify(signed)).not.toMatch(/Cliente Privado|contrato-secreto|nostr\+walletconnect|secret|invoice|documento|email|telefone|cpf/i);
    await clearLrpProjections(database); expect(await database.select().from(lrpPoolProjections)).toHaveLength(0);
    await rebuildLrpProjections(database, state.relays, new Date(now.getTime() + 2000)); expect(await database.select().from(lrpPoolProjections)).toHaveLength(1);
  }, 30_000);

  it("SHADOW calcula e valida o candidato sem publicar PoolCreated", async () => {
    const state = await setup("pool-shadow", "SHADOW");
    const preview = await previewPoolCreated(database, { receivableId: state.created.receivableId, requesterId: state.id, mode: "SHADOW", now });
    const prepared = await acceptAndPreparePoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: state.id, termsHash: preview.termsHash, consent: true, now });
    expect(prepared).toMatchObject({ status: "SHADOW_VALIDATED", divergences: ["LEGACY_POOL_REMAINS_CANONICAL"] });
    expect((await database.select().from(lrpPublicEvents)).some((row) => JSON.parse(row.content).pool_id === prepared.poolId)).toBe(false);
    expect(await database.select().from(pools).where(eq(pools.receivableId, state.created.receivableId))).toHaveLength(1);
  }, 30_000);

  it("bloqueia decisão rejeitada", async () => {
    const state = await setup("pool-rejected", "LRP", false);
    await expect(previewPoolCreated(database, { receivableId: state.created.receivableId, requesterId: state.id, mode: "LRP", now })).rejects.toThrow("LRP_POOL_APPROVED_RECEIVABLE_REQUIRED");
  }, 30_000);

  it("bloqueia originador divergente e NWC inválida, revogada ou expirada", async () => {
    const state = await setup("pool-invalid", "LRP");
    const nwcRow = (await database.select().from(lrpOriginatorEvents).where(eq(lrpOriginatorEvents.receivableId, state.created.receivableId))).find((row) => row.eventType === "NwcAuthorizationAttestation")!;
    await database.update(lrpOriginatorEvents).set({ originatorPubkey: "f".repeat(64) }).where(eq(lrpOriginatorEvents.id, nwcRow.id));
    await expect(previewPoolCreated(database, { receivableId: state.created.receivableId, requesterId: state.id, mode: "LRP", now })).rejects.toThrow("LRP_POOL_ORIGINATOR_AUTHORITY_MISMATCH");
    await database.update(lrpOriginatorEvents).set({ originatorPubkey: await originator.getPublicKey() }).where(eq(lrpOriginatorEvents.id, nwcRow.id));
    const [connection] = await database.select().from(nwcConnections).where(eq(nwcConnections.authorizationId, state.authorizationId));
    for (const mutation of [
      async () => database.update(nwcConnections).set({ status: "INVALID" }).where(eq(nwcConnections.id, connection!.id)),
      async () => database.update(nwcConnections).set({ status: "ACTIVE", revokedAt: now }).where(eq(nwcConnections.id, connection!.id)),
    ]) {
      await mutation();
      await expect(previewPoolCreated(database, { receivableId: state.created.receivableId, requesterId: state.id, mode: "LRP", now })).rejects.toThrow("LRP_POOL_ACTIVE_NWC_REQUIRED");
    }
    await database.update(nwcConnections).set({ status: "ACTIVE", revokedAt: null }).where(eq(nwcConnections.id, connection!.id));
    await expect(previewPoolCreated(database, { receivableId: state.created.receivableId, requesterId: state.id, mode: "LRP", now: new Date(dueAt.getTime() + 4 * 86_400_000) })).rejects.toThrow("LRP_POOL_ACTIVE_NWC_REQUIRED");
  }, 30_000);

  it("bloqueia signer ausente, pubkey diferente, termos alterados e segunda pool", async () => {
    const state = await setup("pool-guards", "LRP");
    const preview = await previewPoolCreated(database, { receivableId: state.created.receivableId, requesterId: state.id, mode: "LRP", now });
    const duplicate = await previewPoolCreated(database, { receivableId: state.created.receivableId, requesterId: state.id, mode: "LRP", now });
    expect(duplicate).toMatchObject({ duplicate: true, poolId: preview.poolId });
    const prepared = await acceptAndPreparePoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: state.id, termsHash: preview.termsHash, consent: true, now });
    await expect(publishPreparedPoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: state.id, clients: state.relays, now })).rejects.toThrow("LRP_SIGNED_EVENT_REQUIRED");
    const wrong = new FakeSigner(new Uint8Array(32).fill(99));
    await expect(publishPreparedPoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: state.id, signedEvent: await wrong.signEvent(prepared.candidate!), clients: state.relays, now })).rejects.toThrow("LRP_SIGNED_EVENT_DOES_NOT_MATCH_CANDIDATE");
    await postgres.query("update lrp_pool_originations set terms_payload = jsonb_set(terms_payload, '{publicTerms,target_sats}', '\"999\"'::jsonb) where id = $1", [preview.poolOriginationId]);
    await expect(publishPreparedPoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: state.id, signedEvent: await state.provider.signEvent(prepared.candidate!), clients: state.relays, now })).rejects.toThrow("LRP_POOL_TERMS_CHANGED");
  }, 30_000);

  it("publica PoolCreated quando o PayerCommitmentProof foi preparado antes da conexão NWC (has_nwc_authorization=false)", async () => {
    const id = "pool-nwc-after";
    const relays = [new InMemoryRelayClient(`wss://${id}-one.example/`), new InMemoryRelayClient(`wss://${id}-two.example/`), new InMemoryRelayClient(`wss://${id}-three.example/`)];
    await database.insert(users).values({ id, reputationId: crypto.randomUUID(), countryCode: "BR", status: "ACTIVE" });
    const requestKey = crypto.randomUUID();
    const created = await createPrivateReceivableDraft(database, {
      requestKey, requesterId: id, mode: "LRP", paymentDescription: "Contrato confidencial", paymentPurpose: "SERVICE",
      nominalUsdCents: 200_000n, dueAt, payerName: "Cliente Privado", payerCountry: "US", evidenceName: "contrato.pdf",
      evidence: { privateObjectReference: `private/${requestKey}`, sha256: createHash("sha256").update(id).digest("hex"), extension: ".pdf", declaredMimeType: "application/pdf", detectedMimeType: "application/pdf", byteSize: 2000, scanStatus: "CLEAN" },
      publicPseudonym: "Criadora 91", now, confirmationExpiresAt: new Date("2026-07-23T12:00:00.000Z"), confirmationBaseUrl: "https://example.test",
    });
    const provider = new FakeSigner(new Uint8Array(32).fill(id.length + 101));
    const root = await prepareReceivableCandidate(database, { draftId: created.draftId, requesterId: id, providerPubkey: await provider.getPublicKey() });
    await publishPreparedReceivable(database, { draftId: created.draftId, requesterId: id, signedEvent: await provider.signEvent(root.candidate!), clients: relays, now });
    const rawToken = new URL(created.confirmationUrl!).hash.slice(1);
    await confirmReceivable(database, { rawToken, acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
    const originatorPubkey = await originator.getPublicKey();
    const commitment = await preparePayerCommitmentProof(database, { receivableId: created.receivableId, mode: "LRP", originatorPubkey, now });
    expect(commitment.status).toBe("CANDIDATE_READY");
    const commitmentContent = JSON.parse(commitment.candidate!.content) as { has_nwc_authorization: boolean };
    expect(commitmentContent.has_nwc_authorization).toBe(false);
    const commitmentPublished = await publishPayerCommitmentProof(database, { originatorEventId: commitment.originatorEventId, originatorPubkey, signedEvent: await originator.signEvent(commitment.candidate!), clients: relays, now });
    await postgres.query("insert into consents (id, user_id, type, policy_version, granted_at) values ($1, $2, 'IDENTITY_PROCESSING', 'v1', $3)", [`consent-${id}`, id, now]);
    await postgres.query("insert into identity_evidences (id, user_id, type, provider, protected_reference, status, verified_at) values ($1, $2, 'IDENTITY', 'test', $3, 'VERIFIED', $4)", [`identity-${id}`, id, `identity/${id}`, now]);
    await postgres.query("insert into credit_limits (user_id, total_amount, used_amount, rule_version, breakdown) values ($1, 1000000, 0, 'limit-v0.1', '{}')", [id]);
    const decision = await evaluateAndPrepareValidationDecision(database, { receivableId: created.receivableId, mode: "LRP", originatorPubkey, now, correlationId: crypto.randomUUID() });
    const decisionPublished = await publishValidationDecision(database, { originatorEventId: decision.originatorEventId, originatorPubkey, signedEvent: await originator.signEvent(decision.candidate!), clients: relays, now });
    const authorization = await createPayerPaymentAuthorization(database, { receivableId: created.receivableId, rawConfirmationToken: rawToken, method: "NWC_AUTOMATIC", maxAmountMsat: 30_000_000n, maxFeeMsat: 10_000n, now });
    const secret = createHash("sha256").update(id).digest("hex");
    await connectNwcAuthorization(database, new FakeNwcGateway(), { publicId: authorization.publicId, managementToken: authorization.managementToken, nwcUri: `nostr+walletconnect://${"c".repeat(64)}?relay=${encodeURIComponent("wss://private-relay.example/")}&secret=${secret}`, now, protectRelayMetadata: true });
    const [privateAuthorization] = await database.select().from(payerPaymentAuthorizations).where(eq(payerPaymentAuthorizations.receivableId, created.receivableId));
    const nwc = await prepareNwcAuthorizationAttestation(database, { receivableId: created.receivableId, mode: "LRP", originatorPubkey, now });
    const nwcPublished = await publishNwcAuthorizationAttestation(database, { originatorEventId: nwc.originatorEventId, originatorPubkey, signedEvent: await originator.signEvent(nwc.candidate!), clients: relays, now });
    const preview = await previewPoolCreated(database, { receivableId: created.receivableId, requesterId: id, mode: "LRP", now });
    const prepared = await acceptAndPreparePoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: id, termsHash: preview.termsHash, consent: true, now });
    const signed = await provider.signEvent(prepared.candidate!);
    const published = await publishPreparedPoolCreated(database, { poolOriginationId: preview.poolOriginationId, requesterId: id, signedEvent: signed, clients: relays, now });
    expect(published).toMatchObject({ publicationStatus: "CONFIRMED", status: "PUBLISHED", publicEventId: signed.id });
    expect(await database.select().from(pools).where(eq(pools.receivableId, created.receivableId))).toHaveLength(1);
    expect(JSON.stringify(signed)).not.toMatch(/nostr\+walletconnect|secret|preimage/i);
    await clearLrpProjections(database);
    await rebuildLrpProjections(database, relays, new Date(now.getTime() + 2000));
    expect(await database.select().from(lrpPoolProjections)).toHaveLength(1);
  }, 30_000);
});
