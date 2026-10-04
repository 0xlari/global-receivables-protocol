// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  confirmReceivable,
  inspectClientConfirmation,
  reviseReceivable,
  reviewValidationException,
  submitReceivable,
  validateReceivableAutomatically,
} from "@/db/repositories/receivable-repository";
import * as schema from "@/db/schema";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-07-14T12:00:00.000Z");
const dueAt = new Date("2026-08-13T12:00:00.000Z");

function token(character: string) {
  return character.repeat(43);
}

function evidence(id: string, hashCharacter = "a") {
  return {
    privateObjectReference: `receivables/${id}/contract`,
    sha256: hashCharacter.repeat(64),
    extension: ".pdf",
    declaredMimeType: "application/pdf",
    detectedMimeType: "application/pdf",
    byteSize: 2_048,
    scanStatus: "CLEAN" as const,
  };
}

async function seedParticipant(id: string, clientId: string, clientDefault = false) {
  await postgres.query("insert into users (id, country_code, status) values ($1, 'BR', 'ACTIVE')", [id]);
  await postgres.query("insert into clients (id, country_code) values ($1, 'US')", [clientId]);
  await postgres.query("insert into consents (id, user_id, type, policy_version, granted_at) values ($1, $2, 'IDENTITY_PROCESSING', 'v1', $3)", [`consent-${id}`, id, now]);
  await postgres.query("insert into identity_evidences (id, user_id, type, provider, protected_reference, status, verified_at) values ($1, $2, 'IDENTITY', 'demo-kyc', $3, 'VERIFIED', $4)", [`identity-${id}`, id, `identity/${id}`, now]);
  await postgres.query("insert into credit_limits (user_id, total_amount, used_amount, rule_version, breakdown) values ($1, 1000000, 0, 'limit-v0.1', '{}')", [id]);
  if (clientDefault) {
    await postgres.query(
      `insert into reputation_facts
        (id, subject_type, subject_id, type, status, evidence_reference, occurred_at)
       values ($1, 'CLIENT', $2, 'CLIENT_DEFAULTED', 'ACTIVE', $3, $4)`,
      [`default-${clientId}`, clientId, `default/${clientId}`, now],
    );
  }
}

async function createReceivable(id: string, hashCharacter: string, tokenCharacter: string, clientDefault = false) {
  const requesterId = `user-${id}`;
  const clientId = `client-${id}`;
  await seedParticipant(requesterId, clientId, clientDefault);
  return submitReceivable(database, {
    requesterId,
    clientId,
    paymentDescription: "Pagamento internacional comprovado",
    paymentPurpose: "SALARY",
    nominalUsdCents: 200_000n,
    dueAt,
    evidence: evidence(id, hashCharacter),
    now,
    confirmationExpiresAt: new Date("2026-07-16T12:00:00.000Z"),
    confirmationBaseUrl: "https://example.test",
    tokenFactory: () => token(tokenCharacter),
  });
}

describe("recebível, confirmação e validação", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);

  afterAll(async () => postgres.close());

  it("armazena apenas o hash e inspeciona um link válido", async () => {
    const created = await createReceivable("secure", "1", "A");
    expect(created.confirmationUrl).toContain("/confirmar#");
    const stored = await postgres.query<{ token_hash: string }>(
      "select token_hash from client_confirmations where receivable_id = $1",
      [created.receivableId],
    );
    expect(stored.rows[0]?.token_hash).toHaveLength(64);
    expect(stored.rows[0]?.token_hash).not.toContain(created.rawToken);

    const details = await inspectClientConfirmation(database, created.rawToken, now);
    expect(details.nominalUsdCents).toBe(200_000n);
    expect(details.paymentPurpose).toBe("SALARY");
    expect(details.termsVersion).toBe("receivable-btc-v2");
  });

  it("não revela se um token é malformado ou expirou", async () => {
    await expect(inspectClientConfirmation(database, "token-curto", now)).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_CONFIRMATION" });
    const created = await createReceivable("expired", "8", "I");
    await expect(inspectClientConfirmation(database, created.rawToken, new Date("2026-07-18T12:00:00.000Z"))).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_CONFIRMATION" });
  });

  it("aceita BTC uma vez e a plataforma aprova reservando limite", async () => {
    const created = await createReceivable("approved", "2", "B");
    const response = await confirmReceivable(database, { rawToken: created.rawToken, acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
    expect(response.outcome).toBe("ACCEPTED");
    await expect(confirmReceivable(database, { rawToken: created.rawToken, acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now })).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_CONFIRMATION" });

    const validation = await validateReceivableAutomatically(database, { receivableId: created.receivableId, now, correlationId: "corr-approved" });
    expect(validation.outcome).toBe("PASSED");
    const state = await postgres.query<{ status: string; used_amount: string }>(
      `select r.status, l.used_amount::text
       from receivables r join credit_limits l on l.user_id = r.requester_id
       where r.id = $1`,
      [created.receivableId],
    );
    expect(state.rows[0]).toEqual({ status: "APPROVED", used_amount: "200000" });
  });

  it("recusa BTC e impede aprovação", async () => {
    const created = await createReceivable("refused", "3", "C");
    const response = await confirmReceivable(database, { rawToken: created.rawToken, acceptsBtc: false, confirmsDescription: true, confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
    expect(response.outcome).toBe("BTC_REFUSED");
    const state = await postgres.query<{ status: string }>("select status from receivables where id = $1", [created.receivableId]);
    expect(state.rows[0]?.status).toBe("REJECTED");
  });

  it("preserva a versão divergente e exige nova confirmação após correção", async () => {
    const created = await createReceivable("diverged", "4", "D");
    const response = await confirmReceivable(database, { rawToken: created.rawToken, acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 190_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
    expect(response.outcome).toBe("DIVERGED");
    const revised = await reviseReceivable(database, { receivableId: created.receivableId, requesterId: "user-diverged", paymentDescription: "Pagamento corrigido", paymentPurpose: "SALE", nominalUsdCents: 190_000n, dueAt, evidence: evidence("diverged-v2", "5"), now, confirmationExpiresAt: new Date("2026-07-17T12:00:00.000Z"), confirmationBaseUrl: "https://example.test", tokenFactory: () => token("E") });
    expect(revised.version).toBe(2);
    const versions = await postgres.query<{ count: number }>("select count(*)::int as count from receivable_versions where receivable_id = $1", [created.receivableId]);
    expect(versions.rows[0]?.count).toBe(2);
  });

  it("encaminha default do cliente para revisão excepcional auditada", async () => {
    const created = await createReceivable("review", "6", "F", true);
    await confirmReceivable(database, { rawToken: created.rawToken, acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
    const validation = await validateReceivableAutomatically(database, { receivableId: created.receivableId, now, correlationId: "corr-review" });
    expect(validation.outcome).toBe("NEEDS_REVIEW");
    const reviewed = await reviewValidationException(database, { validationId: validation.validationId, reviewerId: "admin-internal", decision: "PASSED", reason: "Documentos conferidos excepcionalmente", correlationId: "corr-admin", now });
    expect(reviewed.decision).toBe("PASSED");
    const audit = await postgres.query<{ count: number }>("select count(*)::int as count from admin_reviews where validation_id = $1", [validation.validationId]);
    expect(audit.rows[0]?.count).toBe(1);
  });

  it("bloqueia um recebível duplicado mesmo com confirmação válida", async () => {
    const first = await createReceivable("original", "7", "G");
    await confirmReceivable(database, { rawToken: first.rawToken, acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
    await validateReceivableAutomatically(database, { receivableId: first.receivableId, now, correlationId: "corr-original" });

    const duplicate = await createReceivable("duplicate", "7", "H");
    await confirmReceivable(database, { rawToken: duplicate.rawToken, acceptsBtc: true, confirmsDescription: true, confirmedAmountUsdCents: 200_000n, confirmedDueAt: dueAt, termsVersion: "receivable-btc-v2", now });
    const decision = await validateReceivableAutomatically(database, { receivableId: duplicate.receivableId, now, correlationId: "corr-duplicate" });
    expect(decision).toMatchObject({ outcome: "FAILED", reason: "duplicate" });
  });
});
