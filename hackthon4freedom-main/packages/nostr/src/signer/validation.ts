import { verifyEvent } from "nostr-tools/pure";

import { protocolSignedEventSchema, type ProtocolSignedEvent } from "../../../protocol/src/schemas";

export function validateSignerResult(event: unknown, expectedPubkey: string): ProtocolSignedEvent {
  const parsed = protocolSignedEventSchema.parse(event);
  if (parsed.pubkey !== expectedPubkey) throw new Error("SIGNER_PUBKEY_MISMATCH");
  if (!verifyEvent(parsed)) throw new Error("SIGNER_RETURNED_INVALID_EVENT");
  return parsed;
}
