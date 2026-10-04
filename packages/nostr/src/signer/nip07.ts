import { hex64Schema, type ProtocolUnsignedEvent } from "../../../protocol/src/schemas";

import type { ProtocolSigner, ProtocolSignerBridge, SignerCapabilities } from "./types";
import { validateSignerResult } from "./validation";

export type Nip07Window = Readonly<{ nostr?: ProtocolSignerBridge }>;

export class Nip07Signer implements ProtocolSigner {
  constructor(private readonly provider: ProtocolSignerBridge) {}

  static fromWindow(source: Nip07Window = globalThis as Nip07Window) {
    if (!source.nostr) throw new Error("NIP07_PROVIDER_NOT_AVAILABLE");
    return new Nip07Signer(source.nostr);
  }

  async getPublicKey() {
    return hex64Schema.parse((await this.provider.getPublicKey()).toLowerCase());
  }

  async signEvent(unsignedEvent: ProtocolUnsignedEvent) {
    const pubkey = await this.getPublicKey();
    return validateSignerResult(await this.provider.signEvent(unsignedEvent), pubkey);
  }

  async getCapabilities(): Promise<SignerCapabilities> {
    return { method: "nip07", canSignEvents: true, remote: false, requiresUserInteraction: true };
  }
}
