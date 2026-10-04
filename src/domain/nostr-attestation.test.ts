// @vitest-environment node
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { buildAttestationTemplate, validateSignedAttestation } from "./nostr-attestation";

describe("public Nostr attestations", () => {
  it("contains only the approved positive, opaque schema", () => {
    const secret = generateSecretKey();
    const template = buildAttestationTemplate({ subjectReputationId: "019f605e-94c9-7140-8374-0d9f39119c4e", assertion: "operation_completed", operationRef: "a".repeat(64), evidenceHash: "b".repeat(64), occurredAt: new Date("2026-07-14T12:00:00.000Z") });
    const event = finalizeEvent(template, secret);
    const content = validateSignedAttestation(event);
    expect(content.assertion).toBe("operation_completed");
    expect(event.content).not.toMatch(/amount|currency|payer|contract|contact|email|phone|due_date/i);
  });
  it("references the prior event when issuing an append-only correction", () => {
    const secret = generateSecretKey();
    const previous = "c".repeat(64);
    const template = buildAttestationTemplate({ subjectReputationId: "019f605e-94c9-7140-8374-0d9f39119c4e", assertion: "dispute_resolved", operationRef: "d".repeat(64), evidenceHash: "e".repeat(64), occurredAt: new Date("2026-07-14T12:00:00.000Z"), correctionOf: previous });
    expect(template.tags).toContainEqual(["e", previous, "", "correction"]);
    expect(JSON.parse(template.content).correction_of).toBe(previous);
  });
});
