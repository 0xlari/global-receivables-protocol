import type { ProtocolSignedEvent, ProtocolUnsignedEvent } from "../../../protocol/src/schemas";

export type SignerMethod = "nip07" | "nip46" | "external-app" | "fake";

export type SignerCapabilities = Readonly<{
  method: SignerMethod;
  canSignEvents: true;
  remote: boolean;
  requiresUserInteraction: boolean;
}>;

export interface ProtocolSigner {
  getPublicKey(): Promise<string>;
  signEvent(unsignedEvent: ProtocolUnsignedEvent): Promise<ProtocolSignedEvent>;
  getCapabilities(): Promise<SignerCapabilities>;
}

export interface ProtocolSignerBridge {
  getPublicKey(): Promise<string>;
  signEvent(unsignedEvent: ProtocolUnsignedEvent): Promise<ProtocolSignedEvent>;
}
