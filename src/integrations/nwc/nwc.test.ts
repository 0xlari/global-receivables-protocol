// @vitest-environment node

import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { FakeNwcGateway } from "./fake-gateway";
import { sanitizeNwcLogValue } from "./sanitize";
import { decryptNwcSecret, encryptNwcSecret } from "./secret-crypto";
import { fingerprintNwcConnection, parseNwcUri } from "./uri";

const pubkey = "1".repeat(64);
const secret = "2".repeat(64);
const validUri = `nostr+walletconnect://${pubkey}?relay=${encodeURIComponent("wss://relay.example.com")}&secret=${secret}`;

afterEach(() => delete process.env.NWC_CONNECTION_ENCRYPTION_KEY);

describe("NWC connection security", () => {
  it("parses a strict NIP-47 connection", () => {
    const parsed = parseNwcUri(validUri);
    expect(parsed.walletServicePubkey).toBe(pubkey);
    expect(parsed.relayUrls).toEqual(["wss://relay.example.com/"]);
    expect(fingerprintNwcConnection(parsed)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    "https://example.com",
    `nostr+walletconnect://${pubkey}?relay=http://relay.example.com&secret=${secret}`,
    `nostr+walletconnect://${pubkey}?relay=wss://localhost&secret=${secret}`,
    `nostr+walletconnect://${pubkey}?relay=wss://relay.example.com&secret=bad`,
    `${validUri}&admin=true`,
  ])("rejects malformed or unsafe URI %s", (uri) => {
    expect(() => parseNwcUri(uri)).toThrow();
  });

  it("encrypts with authenticated encryption and detects tampering", () => {
    process.env.NWC_CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const encrypted = encryptNwcSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptNwcSecret(encrypted)).toBe(secret);
    const tampered = Buffer.from(encrypted, "base64url");
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptNwcSecret(tampered.toString("base64url"))).toThrow();
  });

  it("never leaves URI, secret or preimage in sanitized values", () => {
    const sanitized = JSON.stringify(sanitizeNwcLogValue({ nwcUri: validUri, nested: { preimage: secret }, text: `received ${validUri}` }));
    expect(sanitized).not.toContain(secret);
    expect(sanitized).not.toContain("nostr+walletconnect://");
  });

  it("uses a deterministic adapter without relays", async () => {
    const gateway = new FakeNwcGateway({ payment: "QUOTA_EXCEEDED" });
    const result = await gateway.payInvoice();
    expect(result).toEqual({ status: "FAILED", code: "QUOTA_EXCEEDED" });
  });
});
