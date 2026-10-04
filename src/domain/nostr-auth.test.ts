// @vitest-environment node
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { createNostrChallenge, validateNostrChallengeEvent } from "./nostr-auth";

const now = new Date("2026-07-14T12:00:00.000Z");
function signedFixture() {
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);
  const challenge = createNostrChallenge(pubkey, "https://example.com/api/nostr-auth", now);
  return { pubkey, challenge, event: finalizeEvent(challenge.event, secret) };
}

function signedLoginFixture() {
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);
  const challenge = createNostrChallenge(pubkey, "https://example.com/api/auth/nostr/complete", now, "LOGIN");
  return { pubkey, challenge, event: finalizeEvent(challenge.event, secret) };
}

describe("Nostr HTTP authentication", () => {
  it("accepts a valid NIP-98 event bound to URL, payload and expiry", () => {
    const { pubkey, challenge, event } = signedFixture();
    expect(() => validateNostrChallengeEvent({ event, expectedPubkey: pubkey, expectedNonceHash: challenge.nonceHash, expectedRequestUrl: "https://example.com/api/nostr-auth", expiresAt: challenge.expiresAt, usedAt: null, now })).not.toThrow();
  });
  it("rejects replay, expiry and a different domain", () => {
    const { pubkey, challenge, event } = signedFixture();
    const base = { event, expectedPubkey: pubkey, expectedNonceHash: challenge.nonceHash, expectedRequestUrl: "https://example.com/api/nostr-auth", expiresAt: challenge.expiresAt, usedAt: null as Date | null, now };
    expect(() => validateNostrChallengeEvent({ ...base, usedAt: now })).toThrow("ALREADY_USED");
    expect(() => validateNostrChallengeEvent({ ...base, now: challenge.expiresAt })).toThrow("EXPIRED");
    expect(() => validateNostrChallengeEvent({ ...base, expectedRequestUrl: "https://evil.example/api/nostr-auth" })).toThrow("URL_MISMATCH");
  });
  it("rejects a modified signed payload", () => {
    const { pubkey, challenge, event } = signedFixture();
    const modified = { ...event, tags: event.tags.map((tag) => tag[0] === "payload" ? ["payload", "0".repeat(64)] : tag) };
    expect(() => validateNostrChallengeEvent({ event: modified, expectedPubkey: pubkey, expectedNonceHash: challenge.nonceHash, expectedRequestUrl: "https://example.com/api/nostr-auth", expiresAt: challenge.expiresAt, usedAt: null, now })).toThrow("PAYLOAD_MISMATCH");
  });

  it("accepts LOGIN only when purpose and domain are bound to the request", () => {
    const { pubkey, challenge, event } = signedLoginFixture();
    expect(() => validateNostrChallengeEvent({
      event,
      expectedPubkey: pubkey,
      expectedNonceHash: challenge.nonceHash,
      expectedRequestUrl: "https://example.com/api/auth/nostr/complete",
      expiresAt: challenge.expiresAt,
      usedAt: null,
      expectedPurpose: "LOGIN",
      now,
    })).not.toThrow();
    expect(() => validateNostrChallengeEvent({
      event,
      expectedPubkey: pubkey,
      expectedNonceHash: challenge.nonceHash,
      expectedRequestUrl: "https://example.com/api/auth/nostr/complete",
      expiresAt: challenge.expiresAt,
      usedAt: null,
      expectedPurpose: "LINK",
      now,
    })).toThrow("PURPOSE_MISMATCH");
  });

  it("rejects pubkey, method and signature divergence", () => {
    const { pubkey, challenge, event } = signedLoginFixture();
    const base = { event, expectedPubkey: pubkey, expectedNonceHash: challenge.nonceHash, expectedRequestUrl: "https://example.com/api/auth/nostr/complete", expiresAt: challenge.expiresAt, usedAt: null as Date | null, expectedPurpose: "LOGIN" as const, now };
    expect(() => validateNostrChallengeEvent({ ...base, expectedPubkey: "f".repeat(64) })).toThrow("PUBKEY_MISMATCH");
    expect(() => validateNostrChallengeEvent({ ...base, event: { ...event, tags: event.tags.map((tag) => tag[0] === "method" ? ["method", "GET"] : tag) } })).toThrow("METHOD_MISMATCH");
    const invalidSignature = JSON.parse(JSON.stringify(event)) as typeof event;
    invalidSignature.sig = `${event.sig.slice(0, -1)}${event.sig.endsWith("0") ? "1" : "0"}`;
    expect(() => validateNostrChallengeEvent({ ...base, event: invalidSignature })).toThrow("INVALID_NOSTR_SIGNATURE");
  });
});
