import type { Event, EventTemplate } from "nostr-tools";

import type { NostrEventSigner } from "@/domain/nostr-attestation";

export interface BrowserNostrProvider {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<Event>;
}

export class Nip07BrowserSigner implements NostrEventSigner {
  readonly method = "nip07" as const;
  constructor(private readonly provider: BrowserNostrProvider) {}
  getPublicKey() { return this.provider.getPublicKey(); }
  signEvent(event: EventTemplate) { return this.provider.signEvent(event); }
}

export class Nip46RemoteSigner implements NostrEventSigner {
  readonly method = "nip46" as const;
  constructor(private readonly delegate?: NostrEventSigner) {}
  private configured() {
    if (!this.delegate) throw new Error("NIP46_REMOTE_SIGNER_NOT_CONFIGURED");
    return this.delegate;
  }
  getPublicKey() { return this.configured().getPublicKey(); }
  signEvent(event: EventTemplate) { return this.configured().signEvent(event); }
}
