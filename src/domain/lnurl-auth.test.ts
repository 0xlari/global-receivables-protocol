// @vitest-environment node
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bech32 } from "@scure/base";
import { describe, expect, it } from "vitest";

import { createLnurlAuthChallenge, resolveLnurlAuthBaseUrl, verifyLnurlAuthSignature } from "./lnurl-auth";

describe("LNURL-auth", () => {
  it("creates a five-minute, domain-bound LNURL challenge", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const challenge = createLnurlAuthChallenge({ callbackBaseUrl: "https://auth.agendacryptoo.com", now });
    const decoded = new TextDecoder().decode(bech32.fromWords(bech32.decode(challenge.lnurl, false).words));
    const callback = new URL(decoded);

    expect(callback.hostname).toBe("auth.agendacryptoo.com");
    expect(callback.searchParams.get("tag")).toBe("login");
    expect(callback.searchParams.get("action")).toBe("login");
    expect(callback.searchParams.get("k1")).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.expiresAt.toISOString()).toBe("2026-07-16T12:05:00.000Z");
  });

  it("verifies the DER secp256k1 signature over k1", () => {
    const secretKey = secp256k1.utils.randomSecretKey();
    const publicKey = secp256k1.getPublicKey(secretKey, true);
    const k1 = crypto.getRandomValues(new Uint8Array(32));
    const signature = secp256k1.sign(k1, secretKey, { format: "der", prehash: false });

    expect(verifyLnurlAuthSignature({
      k1: Buffer.from(k1).toString("hex"),
      key: Buffer.from(publicKey).toString("hex"),
      signature: Buffer.from(signature).toString("hex"),
    }).linkingKeyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an invalid signature and insecure production callback", () => {
    const first = secp256k1.keygen();
    const second = secp256k1.keygen();
    const k1 = crypto.getRandomValues(new Uint8Array(32));
    const signature = secp256k1.sign(k1, first.secretKey, { format: "der", prehash: false });
    expect(() => verifyLnurlAuthSignature({ k1: Buffer.from(k1).toString("hex"), key: Buffer.from(second.publicKey).toString("hex"), signature: Buffer.from(signature).toString("hex") })).toThrow("LNURL_SIGNATURE_INVALID");
    expect(() => resolveLnurlAuthBaseUrl("http://example.com", { NODE_ENV: "production" })).toThrow("HTTPS_REQUIRED");
  });
});
