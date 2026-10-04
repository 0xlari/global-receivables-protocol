import { createHash, randomBytes, randomUUID } from "node:crypto";

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bech32 } from "@scure/base";
import { z } from "zod";

const hex32 = z.string().regex(/^[a-f0-9]{64}$/);
const compressedPublicKey = z.string().regex(/^(02|03)[a-f0-9]{64}$/);
const derSignature = z.string().regex(/^30[0-9a-f]{12,142}$/).max(144);

export const LNURL_AUTH_TTL_MS = 5 * 60 * 1_000;
export const APP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export function sha256Hex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
export function createLnurlAuthChallenge(input: {
  callbackBaseUrl: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const k1 = randomBytes(32).toString("hex");
  const pollToken = randomBytes(32).toString("base64url");
  const callbackUrl = new URL("/api/auth/lnurl/callback", input.callbackBaseUrl);
  callbackUrl.searchParams.set("tag", "login");
  callbackUrl.searchParams.set("k1", k1);
  callbackUrl.searchParams.set("action", "login");

  return {
    id: randomUUID(),
    k1,
    k1Hash: sha256Hex(k1),
    pollToken,
    pollTokenHash: sha256Hex(pollToken),
    callbackUrl: callbackUrl.toString(),
    callbackDomain: callbackUrl.hostname.toLowerCase(),
    lnurl: bech32.encode("lnurl", bech32.toWords(new TextEncoder().encode(callbackUrl.toString())), false),
    expiresAt: new Date(now.getTime() + LNURL_AUTH_TTL_MS),
  };
}

export function verifyLnurlAuthSignature(input: {
  k1: string;
  key: string;
  signature: string;
}) {
  const k1 = hex32.parse(input.k1.toLowerCase());
  const key = compressedPublicKey.parse(input.key.toLowerCase());
  const signature = derSignature.parse(input.signature.toLowerCase());

  const valid = secp256k1.verify(
    Uint8Array.from(Buffer.from(signature, "hex")),
    Uint8Array.from(Buffer.from(k1, "hex")),
    Uint8Array.from(Buffer.from(key, "hex")),
    { format: "der", prehash: false, lowS: false },
  );
  if (!valid) throw new Error("LNURL_SIGNATURE_INVALID");
  return { linkingKeyHash: sha256Hex(key) };
}

export function resolveLnurlAuthBaseUrl(requestUrl: string, environment: NodeJS.ProcessEnv = process.env) {
  const configured = environment.LNURL_AUTH_BASE_URL ?? environment.NEXT_PUBLIC_SITE_URL;
  const url = new URL(configured || new URL(requestUrl).origin);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(environment.NODE_ENV !== "production" && local)) {
    throw new Error("LNURL_AUTH_HTTPS_REQUIRED");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}
