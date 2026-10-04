import { validateProtocolEvent } from "../../../protocol/src/validators";
import type { ProtocolSignedEvent } from "../../../protocol/src/schemas";

export function verifyProtocolEventForSubscription(event: ProtocolSignedEvent) {
  const result = validateProtocolEvent(event);
  return result.valid ? { valid: true as const } : { valid: false as const, reason: result.reason };
}
