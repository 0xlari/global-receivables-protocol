import { createHash } from "node:crypto";

import type { ParsedNwcConnection } from "./types";

const HEX_32_BYTES = /^[a-f0-9]{64}$/;
const MAX_URI_LENGTH = 4096;
const MAX_RELAY_LENGTH = 512;
const MAX_RELAYS = 3;
const ALLOWED_PARAMS = new Set(["relay", "secret", "lud16"]);

function assertPublicRelay(raw: string): string {
  if (raw.length > MAX_RELAY_LENGTH) throw new Error("NWC_RELAY_TOO_LONG");
  const relay = new URL(raw);
  if (relay.protocol !== "wss:" || relay.username || relay.password || relay.hash) {
    throw new Error("NWC_RELAY_INVALID");
  }
  const host = relay.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("NWC_RELAY_PRIVATE");
  }
  return relay.toString();
}

export function parseNwcUri(raw: string): ParsedNwcConnection {
  if (!raw || raw.length > MAX_URI_LENGTH) throw new Error("NWC_URI_SIZE");
  const uri = new URL(raw.trim());
  if (uri.protocol !== "nostr+walletconnect:") throw new Error("NWC_PROTOCOL_INVALID");

  for (const key of uri.searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key)) throw new Error("NWC_PARAMETER_INVALID");
  }

  const walletServicePubkey = (uri.hostname || uri.pathname.replace(/^\//, "")).toLowerCase();
  const secrets = uri.searchParams.getAll("secret");
  const relays = uri.searchParams.getAll("relay");
  const lud16Values = uri.searchParams.getAll("lud16");
  if (!HEX_32_BYTES.test(walletServicePubkey)) throw new Error("NWC_PUBKEY_INVALID");
  if (secrets.length !== 1 || !HEX_32_BYTES.test(secrets[0] ?? "")) {
    throw new Error("NWC_SECRET_INVALID");
  }
  if (relays.length === 0 || relays.length > MAX_RELAYS) throw new Error("NWC_RELAY_COUNT");
  if (lud16Values.length > 1) throw new Error("NWC_PARAMETER_INVALID");

  return {
    walletServicePubkey,
    relayUrls: [...new Set(relays.map(assertPublicRelay))],
    secret: secrets[0]!,
    ...(lud16Values[0] ? { lud16: lud16Values[0] } : {}),
  };
}

export function fingerprintNwcConnection(connection: ParsedNwcConnection): string {
  return createHash("sha256")
    .update([
      connection.walletServicePubkey,
      ...[...connection.relayUrls].sort(),
      connection.secret,
    ].join("\n"))
    .digest("hex");
}
