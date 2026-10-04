import { describe, expect, it } from "vitest";

import { buildConfirmationUrl, generateConfirmationToken, hashConfirmationToken } from "./confirmation-token";
import { compareClientConfirmation, paymentPurposes, validateEvidenceMetadata, validateReceivableTerms } from "./receivable";
import { evaluateReceivable } from "./receivable-validation";

const now = new Date("2026-07-14T12:00:00.000Z");

describe("recebível e confirmação", () => {
  it("gera token opaco e coloca o segredo apenas no fragmento", () => {
    const token = generateConfirmationToken();
    const url = new URL(buildConfirmationUrl("https://example.test", token));
    expect(token).toHaveLength(43);
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#${token}`);
    expect(hashConfirmationToken(token)).not.toContain(token);
  });

  it("aceita salário, venda, comissão, serviço ou outro pagamento do exterior", () => {
    for (const paymentPurpose of paymentPurposes) {
      expect(() => validateReceivableTerms({ requesterCountryCode: "BR", clientCountryCode: "US", paymentPurpose, nominalUsdCents: 200_000n, dueAt: new Date("2026-08-13T12:00:00.000Z"), now })).not.toThrow();
    }
    expect(() => validateReceivableTerms({ requesterCountryCode: "BR", clientCountryCode: "BR", paymentPurpose: "SALE", nominalUsdCents: 200_000n, dueAt: new Date("2026-08-13T12:00:00.000Z"), now })).toThrowError(/exterior/);
  });

  it("bloqueia referência com traversal e tipo declarado diferente do real", () => {
    const base = { privateObjectReference: "receivables/r1/e1", sha256: "a".repeat(64), extension: ".pdf", declaredMimeType: "application/pdf", detectedMimeType: "application/pdf", byteSize: 100, scanStatus: "CLEAN" as const };
    expect(() => validateEvidenceMetadata(base)).not.toThrow();
    expect(() => validateEvidenceMetadata({ ...base, privateObjectReference: "../secret" })).toThrowError(/Referência/);
    expect(() => validateEvidenceMetadata({ ...base, detectedMimeType: "text/html" })).toThrowError(/Tipo real/);
  });

  it("recusa BTC antes de comparar e detecta divergência", () => {
    const base = { expectedAmountUsdCents: 200_000n, expectedDueAt: now, confirmedAmountUsdCents: 200_000n, confirmedDueAt: now, confirmsDescription: true, acceptsBtc: true, termsVersion: "receivable-btc-v2" };
    expect(compareClientConfirmation({ ...base, acceptsBtc: false }).outcome).toBe("BTC_REFUSED");
    expect(compareClientConfirmation({ ...base, confirmedAmountUsdCents: 199_000n }).outcome).toBe("DIVERGED");
    expect(compareClientConfirmation({ ...base, confirmsDescription: false }).divergences).toContain("PAYMENT_DESCRIPTION");
    expect(compareClientConfirmation(base).outcome).toBe("ACCEPTED");
  });

  it("a plataforma encaminha histórico de default para revisão excepcional", () => {
    const result = evaluateReceivable({ requesterCountryCode: "BR", clientCountryCode: "US", identityVerified: true, identityConsentActive: true, evidenceClean: true, clientAcceptedBtc: true, confirmationMatches: true, duplicateEvidence: false, clientHasDefault: true, availableLimitUsdCents: 300_000n, nominalUsdCents: 200_000n });
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(result.reason).toBe("client_default_history");
  });
});
