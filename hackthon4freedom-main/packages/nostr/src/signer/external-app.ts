import { hex64Schema, type ProtocolUnsignedEvent } from "../../../protocol/src/schemas";

import type { ProtocolSigner, ProtocolSignerBridge, SignerCapabilities } from "./types";
import { validateSignerResult } from "./validation";

export class ExternalAppSigner implements ProtocolSigner {
  constructor(private readonly bridge: ProtocolSignerBridge) {}

  async getPublicKey() {
    return hex64Schema.parse((await this.bridge.getPublicKey()).toLowerCase());
  }

  async signEvent(unsignedEvent: ProtocolUnsignedEvent) {
    const pubkey = await this.getPublicKey();
    return validateSignerResult(await this.bridge.signEvent(unsignedEvent), pubkey);
  }

  async getCapabilities(): Promise<SignerCapabilities> {
    return { method: "external-app", canSignEvents: true, remote: true, requiresUserInteraction: true };
  }
}
