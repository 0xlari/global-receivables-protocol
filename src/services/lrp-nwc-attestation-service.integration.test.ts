// @vitest-environment node

import { createHash, randomBytes } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryRelayClient } from "@nostr/relays";
import { FakeSigner } from "@nostr/signer";
import * as schema from "@/db/schema";
import { lrpReceivableProjections, users } from "@/db/schema";
import { connectNwcAuthorization, createPayerPaymentAuthorization, revokePayerPaymentAuthorization } from "@/db/repositories/payer-payment-repository";
import { confirmReceivable } from "@/db/repositories/receivable-repository";
import { FakeNwcGateway } from "@/integrations/nwc/fake-gateway";
import { prepareNwcAuthorizationAttestation, publishNwcAuthorizationAttestation } from "@/services/lrp-nwc-attestation-service";
import { preparePayerCommitmentProof, publishPayerCommitmentProof } from "@/services/lrp-payer-confirmation-service";
import { createPrivateReceivableDraft, prepareReceivableCandidate, publishPreparedReceivable } from "@/services/lrp-receivable-origination-service";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-21T12:00:00.000Z");
const dueAt = new Date("2026-08-20T12:00:00.000Z");
const relays = [new InMemoryRelayClient("wss://one.example/"), new InMemoryRelayClient("wss://two.example/"), new InMemoryRelayClient("wss://three.example/")];
const originator = new FakeSigner(new Uint8Array(32).fill(71));
const walletPubkey = "c".repeat(64);
const privateRelay = "wss://wallet-relay.example/";

async function setup(id: string, mode: "SHADOW" | "LRP") {
  const connectionSecret = createHash("sha256").update(`nwc:${id}`).digest("hex");
  const nwcUri = `nostr+walletconnect://${walletPubkey}?relay=${encodeURIComponent(privateRelay)}&secret=${connectionSecret}`;
  await database.insert(users).values({ id, reputationId: crypto.randomUUID(), countryCode: "BR", status: "ACTIVE" });
  const requestKey = crypto.randomUUID();
  const created = await createPrivateReceivableDraft(database, {
    requestKey, requesterId: id, mode, paymentDescription: "Venda internacional privada", paymentPurpose: "SALE",
    nominalUsdCents: 100_000n, dueAt, payerName: "Comprador Privado", payerCountry: "US", evidenceName: "invoice.pdf",
    evidence: { privateObjectReference: `receivables/${requestKey}/evidence`, sha256: "e".repeat(64), extension: ".pdf", declaredMimeType: "application/pdf", detectedMimeType: "application/pdf", byteSize: 2048, scanStatus: "PENDING" },
    publicPseudonym: "Criadora 71", now, confirmationExpiresAt: new Date("2026-07-23T12:00:00.000Z"), confirmationBaseUrl: "https://example.test",
  });
  const provider = new FakeSigner(new Uint8Array(32).fill(id.length + 80));
  const root = await prepareReceivableCandidate(database, { draftId: created.draftId, requesterId: id, providerPubkey: await provider.getPublicKey() });
  if (mode === "LRP") await publishPreparedReceivable(database, { draftId: created.draftId, requesterId: id, signedEvent: await provider.signEvent(root.candidate!), clients: relays, now });
  const rawToken = new URL(created.confirmationUrl!).hash.slice(1);
  await confirmReceivable(database, { rawToken, acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 100_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
  const originatorPubkey = await originator.getPublicKey();
  const commitment = await preparePayerCommitmentProof(database, { receivableId: created.receivableId, mode, originatorPubkey, now });
  if (mode === "LRP") await publishPayerCommitmentProof(database, { originatorEventId: commitment.originatorEventId, originatorPubkey, signedEvent: await originator.signEvent(commitment.candidate!), clients: relays, now });
  const authorization = await createPayerPaymentAuthorization(database, { receivableId: created.receivableId, rawConfirmationToken: rawToken, method: "NWC_AUTOMATIC", maxAmountMsat: 10_000_000n, maxFeeMsat: 10_000n, now });
  await connectNwcAuthorization(database, new FakeNwcGateway(), { publicId: authorization.publicId, managementToken: authorization.managementToken, nwcUri, now, protectRelayMetadata: true });
  return { created, authorization, originatorPubkey, connectionSecret };
}

describe("atestado NWC no fluxo real LRP", () => {
  beforeAll(async () => {
    process.env.NWC_CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    postgres = new PGlite(); database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => {
    delete process.env.NWC_CONNECTION_ENCRYPTION_KEY;
    await postgres.close();
  });

  it("SHADOW cifra secret e relays, valida pay_invoice e não publica", async () => {
    const { created, originatorPubkey, connectionSecret } = await setup("nwc-shadow", "SHADOW");
    const prepared = await prepareNwcAuthorizationAttestation(database, { receivableId: created.receivableId, mode: "SHADOW", originatorPubkey, now });
    expect(prepared.status).toBe("SHADOW_VALIDATED");
    const stored = await postgres.query<{ relay_urls: unknown; encrypted_connection_secret: string; encrypted_connection_metadata: string }>("select relay_urls, encrypted_connection_secret, encrypted_connection_metadata from nwc_connections where authorization_id = (select id from payer_payment_authorizations where receivable_id = $1)", [created.receivableId]);
    expect(stored.rows[0]?.relay_urls).toEqual([]);
    expect(stored.rows[0]?.encrypted_connection_secret).not.toContain(connectionSecret);
    expect(stored.rows[0]?.encrypted_connection_metadata).not.toContain(privateRelay);
    expect(JSON.stringify(prepared.candidate)).not.toMatch(/nostr\+walletconnect|wallet-relay|preimage|secret|lnbc[0-9]/i);
  });

  it("LRP publica somente atestado seguro e rebuild inclui a projeção", async () => {
    const { created, originatorPubkey } = await setup("nwc-lrp", "LRP");
    const prepared = await prepareNwcAuthorizationAttestation(database, { receivableId: created.receivableId, mode: "LRP", originatorPubkey, now });
    const signed = await originator.signEvent(prepared.candidate!);
    const published = await publishNwcAuthorizationAttestation(database, { originatorEventId: prepared.originatorEventId, originatorPubkey, signedEvent: signed, clients: relays, now });
    expect(published).toMatchObject({ publicationStatus: "CONFIRMED", status: "PUBLISHED", publicEventId: signed.id });
    const content = JSON.parse(signed.content);
    expect(content).toMatchObject({ event_type: "NwcAuthorizationAttestation", authorization_state: "ACTIVE", pay_invoice_supported: true, executor_pubkey: originatorPubkey });
    expect(JSON.stringify(signed)).not.toMatch(/nostr\+walletconnect|wallet-relay|preimage|secret|lnbc[0-9]/i);
    const projections = await database.select().from(lrpReceivableProjections);
    const projection = projections.find((row) => row.receivableId === created.receivableId);
    expect(projection?.projection).toMatchObject({ nwcAttestationsByExecutor: { [originatorPubkey]: [expect.objectContaining({ eventId: signed.id, authorizationState: "ACTIVE", payInvoiceSupported: true })] } });
  });

  it("bloqueia atestado ACTIVE depois da revogação", async () => {
    const { created, authorization, originatorPubkey } = await setup("nwc-revoked", "LRP");
    await revokePayerPaymentAuthorization(database, { publicId: authorization.publicId, managementToken: authorization.managementToken, now: new Date(now.getTime() + 1000) });
    await expect(prepareNwcAuthorizationAttestation(database, { receivableId: created.receivableId, mode: "LRP", originatorPubkey, now: new Date(now.getTime() + 2000) })).rejects.toThrow("LRP_NWC_ACTIVE_ATTESTATION_BLOCKED");
  });
});
