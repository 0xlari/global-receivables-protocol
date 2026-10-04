import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

import type { ProtocolUnsignedEvent } from "../../../protocol/src/schemas";
import type { ProtocolSigner, SignerCapabilities } from "./types";

/** Test-only deterministic signer. Never instantiate in application code. */
export class FakeSigner implements ProtocolSigner {
  constructor(private readonly testSecretKey: Uint8Array) {
    if (process.env.NODE_ENV === "production") throw new Error("FAKE_SIGNER_FORBIDDEN_IN_PRODUCTION");
  }

  async getPublicKey() {
    return getPublicKey(this.testSecretKey);
  }

  async signEvent(unsignedEvent: ProtocolUnsignedEvent) {
    return finalizeEvent(unsignedEvent, this.testSecretKey);
  }

  async getCapabilities(): Promise<SignerCapabilities> {
    return { method: "fake", canSignEvents: true, remote: false, requiresUserInteraction: false };
  }
}
