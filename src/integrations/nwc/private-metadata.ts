import { z } from "zod";

import { decryptNwcSecret, encryptNwcSecret } from "./secret-crypto";

const metadataSchema = z.object({ relayUrls: z.array(z.string().url()).min(1).max(3) }).strict();

export function encryptNwcPrivateMetadata(relayUrls: readonly string[]) {
  return encryptNwcSecret(JSON.stringify(metadataSchema.parse({ relayUrls: [...relayUrls] })));
}

export function readNwcPrivateRelayUrls(input: { relayUrls: unknown; encryptedConnectionMetadata?: string | null }) {
  if (input.encryptedConnectionMetadata) {
    return metadataSchema.parse(JSON.parse(decryptNwcSecret(input.encryptedConnectionMetadata))).relayUrls;
  }
  return z.array(z.string().url()).min(1).max(3).parse(input.relayUrls);
}
