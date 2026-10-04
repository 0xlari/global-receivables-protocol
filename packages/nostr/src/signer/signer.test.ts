import { describe, expect, it } from "vitest";
import { verifyEvent } from "nostr-tools/pure";

import { validContentVectors } from "../../../protocol/src/test-vectors/valid";
import { FakeSigner } from "./fake";
import { ExternalAppSigner } from "./external-app";
import { Nip07Signer } from "./nip07";
import { Nip46Signer } from "./nip46";

const secret = new Uint8Array(32).fill(7);
const fake = new FakeSigner(secret);
const content = validContentVectors[1]!;
const unsigned = { kind: content.kind, created_at: 1_800_000_000, tags: [["alt", "Recebível experimental"]], content: JSON.stringify(content.content) };
const bridge = { getPublicKey: () => fake.getPublicKey(), signEvent: (event: typeof unsigned) => fake.signEvent(event) };

describe("protocol signers", () => {
  it("signs deterministic valid events with the fake signer", async () => {
    const event = await fake.signEvent(unsigned);
    expect(verifyEvent(event)).toBe(true);
    expect(event.pubkey).toBe(await fake.getPublicKey());
  });

  it("uses a NIP-07 browser provider", async () => {
    const signer = Nip07Signer.fromWindow({ nostr: bridge });
    expect((await signer.getCapabilities()).method).toBe("nip07");
    expect(verifyEvent(await signer.signEvent(unsigned))).toBe(true);
  });

  it("uses a connected NIP-46 transport and rejects a disconnected one", async () => {
    const signer = new Nip46Signer({ ...bridge, isConnected: async () => true });
    expect(verifyEvent(await signer.signEvent(unsigned))).toBe(true);
    await expect(new Nip46Signer({ ...bridge, isConnected: async () => false }).getPublicKey()).rejects.toThrow("NIP46_SIGNER_NOT_CONNECTED");
  });

  it("supports an external application bridge", async () => {
    const signer = new ExternalAppSigner(bridge);
    expect((await signer.getCapabilities()).method).toBe("external-app");
    expect(verifyEvent(await signer.signEvent(unsigned))).toBe(true);
  });

  it("rejects a provider event signed by another pubkey", async () => {
    const other = new FakeSigner(new Uint8Array(32).fill(8));
    const signer = new Nip07Signer({ getPublicKey: () => fake.getPublicKey(), signEvent: (event) => other.signEvent(event) });
    await expect(signer.signEvent(unsigned)).rejects.toThrow("SIGNER_PUBKEY_MISMATCH");
  });
});
