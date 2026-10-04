import { hex64Schema, type ProtocolUnsignedEvent } from "../../../protocol/src/schemas";

import type { ProtocolSigner, ProtocolSignerBridge, SignerCapabilities } from "./types";
import { validateSignerResult } from "./validation";

/** Transport established by a NIP-46 client. It owns pairing and encrypted RPC. */
export interface Nip46Transport extends ProtocolSignerBridge {
  isConnected(): Promise<boolean>;
}

export class Nip46Signer implements ProtocolSigner {
  constructor(private readonly transport: Nip46Transport) {}

  private async connected() {
    if (!(await this.transport.isConnected())) throw new Error("NIP46_SIGNER_NOT_CONNECTED");
  }

  async getPublicKey() {
    await this.connected();
    return hex64Schema.parse((await this.transport.getPublicKey()).toLowerCase());
  }

  async signEvent(unsignedEvent: ProtocolUnsignedEvent) {
    const pubkey = await this.getPublicKey();
    return validateSignerResult(await this.transport.signEvent(unsignedEvent), pubkey);
  }

  async getCapabilities(): Promise<SignerCapabilities> {
    await this.connected();
    return { method: "nip46", canSignEvents: true, remote: true, requiresUserInteraction: true };
  }
}
