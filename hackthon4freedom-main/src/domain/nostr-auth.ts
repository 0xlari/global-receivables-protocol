import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Event, EventTemplate } from "nostr-tools";
import { verifyEvent } from "nostr-tools/pure";

export const NOSTR_HTTP_AUTH_KIND = 27235;
export const NOSTR_CHALLENGE_TTL_SECONDS = 60;
export const NOSTR_SESSION_TTL_SECONDS = 60 * 60 * 12;
export type NostrAuthPurpose = "LINK" | "LOGIN";

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function isHexPubkey(value: string) {
  return /^[a-f0-9]{64}$/.test(value);
}

export function createNostrChallenge(pubkey: string, requestUrl: string, now = new Date(), purpose: NostrAuthPurpose = "LINK") {
  if (!isHexPubkey(pubkey)) throw new Error("INVALID_NOSTR_PUBKEY");
  const url = new URL(requestUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("INVALID_AUTH_URL");

  const nonce = randomBytes(32).toString("hex");
  const nonceHash = sha256Hex(nonce);
  const expiresAt = new Date(now.getTime() + NOSTR_CHALLENGE_TTL_SECONDS * 1000);
  const event: EventTemplate = {
    kind: NOSTR_HTTP_AUTH_KIND,
    created_at: Math.floor(now.getTime() / 1000),
    content: "",
    tags: [
      ["u", url.toString()],
      ["method", "POST"],
      ["payload", nonceHash],
      ["expiration", String(Math.floor(expiresAt.getTime() / 1000))],
      ["domain", url.host],
      ["purpose", purpose],
    ],
  };

  return { id: randomUUID(), nonceHash, event, expiresAt };
}

function singleTag(event: Event, name: string) {
  const values = event.tags.filter((tag) => tag[0] === name);
  return values.length === 1 ? values[0]?.[1] : undefined;
}

export function validateNostrChallengeEvent(input: {
  event: Event;
  expectedPubkey: string;
  expectedNonceHash: string;
  expectedRequestUrl: string;
  expiresAt: Date;
  usedAt: Date | null;
  expectedPurpose?: NostrAuthPurpose;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.usedAt) throw new Error("NOSTR_CHALLENGE_ALREADY_USED");
  if (now >= input.expiresAt) throw new Error("NOSTR_CHALLENGE_EXPIRED");
  if (input.event.kind !== NOSTR_HTTP_AUTH_KIND || input.event.content !== "") throw new Error("INVALID_NOSTR_AUTH_EVENT");
  if (input.event.pubkey !== input.expectedPubkey) throw new Error("NOSTR_PUBKEY_MISMATCH");
  if (Math.abs(Math.floor(now.getTime() / 1000) - input.event.created_at) > NOSTR_CHALLENGE_TTL_SECONDS) throw new Error("STALE_NOSTR_AUTH_EVENT");
  if (singleTag(input.event, "u") !== new URL(input.expectedRequestUrl).toString()) throw new Error("NOSTR_AUTH_URL_MISMATCH");
  if (singleTag(input.event, "method") !== "POST") throw new Error("NOSTR_AUTH_METHOD_MISMATCH");
  if (singleTag(input.event, "payload") !== input.expectedNonceHash) throw new Error("NOSTR_AUTH_PAYLOAD_MISMATCH");
  if (singleTag(input.event, "expiration") !== String(Math.floor(input.expiresAt.getTime() / 1000))) throw new Error("NOSTR_AUTH_EXPIRATION_MISMATCH");
  const expectedUrl = new URL(input.expectedRequestUrl);
  if (singleTag(input.event, "domain") !== expectedUrl.host) throw new Error("NOSTR_AUTH_DOMAIN_MISMATCH");
  if (singleTag(input.event, "purpose") !== (input.expectedPurpose ?? "LINK")) throw new Error("NOSTR_AUTH_PURPOSE_MISMATCH");
  if (!verifyEvent(input.event)) throw new Error("INVALID_NOSTR_SIGNATURE");
}

export function createSessionToken() {
  const rawToken = randomBytes(32).toString("base64url");
  return { id: randomUUID(), rawToken, tokenHash: sha256Hex(rawToken) };
}
