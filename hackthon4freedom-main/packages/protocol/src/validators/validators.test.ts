// @vitest-environment node
import { describe, expect, it } from "vitest";
import { finalizeEvent } from "nostr-tools/pure";

import { FakeSigner } from "../../../nostr/src/signer";
import { buildProtocolEvent } from "../builders";
import type { ProtocolKind } from "../kinds";
import type { ProtocolContent } from "../schemas";
import { validContentVectors } from "../test-vectors/valid";
import { validateProtocolEvent } from "./event";
import { validatePoolCreationGraph } from "./pool-creation";

const provider = new FakeSigner(new Uint8Array(32).fill(11));
const originator = new FakeSigner(new Uint8Array(32).fill(12));

async function signVector(index: number, signer: FakeSigner, overrides: Record<string, unknown> = {}) {
  const vector = validContentVectors[index]!;
  const pubkey = await signer.getPublicKey();
  const content = { ...vector.content, ...overrides } as ProtocolContent;
  if (content.event_type === "ReceivableCreated") content.provider_pubkey = pubkey;
  if (content.event_type === "PayerCommitmentProof") content.originator_pubkey = pubkey;
  if (content.event_type === "ClientValidationDecision") content.client_pubkey = pubkey;
  if (content.event_type === "NwcAuthorizationAttestation") content.executor_pubkey = pubkey;
  if (content.event_type === "PoolTransition") content.actor_pubkey = pubkey;
  return signer.signEvent(buildProtocolEvent(vector.kind as ProtocolKind, content));
}

describe("LRP builders and validators", () => {
  it("builds, signs and validates every implemented event", async () => {
    for (let index = 0; index < validContentVectors.length; index += 1) {
      const signer = [2, 3, 4].includes(index) ? originator : provider;
      const event = await signVector(index, signer, index === 5 ? { originator_pubkey: await originator.getPublicKey() } : {});
      expect(validateProtocolEvent(event)).toMatchObject({ valid: true });
    }
  });

  it("rejects invalid signatures and invalid schemas", async () => {
    const event = await signVector(1, provider);
    expect(validateProtocolEvent({ ...event, sig: "0".repeat(128) })).toMatchObject({ valid: false, reason: "INVALID_NOSTR_SIGNATURE" });
    const bad = finalizeEvent({ ...buildProtocolEvent(validContentVectors[1]!.kind as ProtocolKind, validContentVectors[1]!.content), content: "{}" }, new Uint8Array(32).fill(11));
    expect(validateProtocolEvent(bad)).toMatchObject({ valid: false, reason: "INVALID_CONTENT_SCHEMA" });
  });

  it("rejects a payer commitment that claims another originator", async () => {
    const attacker = new FakeSigner(new Uint8Array(32).fill(14));
    const vector = validContentVectors[2]!;
    const event = await attacker.signEvent(buildProtocolEvent(
      vector.kind as ProtocolKind,
      { ...vector.content, originator_pubkey: await originator.getPublicKey() } as ProtocolContent,
    ));
    expect(validateProtocolEvent(event)).toMatchObject({
      valid: false,
      reason: "ORIGINATOR_AUTHOR_MISMATCH",
    });
  });

  it("rejects known PII and NWC credentials even when signed", async () => {
    const receivable = validContentVectors[1]!;
    const unsafeContent = JSON.stringify({ ...receivable.content, title: "Contato private@example.com" });
    const unsafe = finalizeEvent({ ...buildProtocolEvent(receivable.kind as ProtocolKind, receivable.content), content: unsafeContent }, new Uint8Array(32).fill(11));
    expect(validateProtocolEvent(unsafe)).toMatchObject({ valid: false, reason: "FORBIDDEN_PUBLIC_DATA" });
    const nwc = validContentVectors[4]!;
    const leaked = finalizeEvent({ ...buildProtocolEvent(nwc.kind as ProtocolKind, { ...nwc.content, executor_pubkey: await originator.getPublicKey() } as ProtocolContent), content: JSON.stringify({ ...nwc.content, nwc_uri: "nostr+walletconnect://secret" }) }, new Uint8Array(32).fill(12));
    expect(validateProtocolEvent(leaked)).toMatchObject({ valid: false, reason: "FORBIDDEN_PUBLIC_DATA" });
  });

  it("requires approval and active NWC from the selected originator", async () => {
    const originatorPubkey = await originator.getPublicKey();
    const receivable = await signVector(1, provider);
    const commitment = await signVector(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey, has_nwc_authorization: false });
    const approval = await signVector(3, originator, { receivable_event_id: receivable.id });
    const nwc = await signVector(4, originator, { receivable_event_id: receivable.id });
    const poolVector = validContentVectors[5]!;
    const poolContent = { ...poolVector.content, receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id, approval_event_id: approval.id, nwc_attestation_event_id: nwc.id, originator_pubkey: originatorPubkey } as ProtocolContent;
    const pool = await provider.signEvent(buildProtocolEvent(poolVector.kind as ProtocolKind, poolContent));
    expect(validatePoolCreationGraph(pool, [receivable, commitment, approval, nwc])).toMatchObject({ valid: true });
    expect(validatePoolCreationGraph(pool, [receivable, commitment, approval])).toEqual({ valid: false, reason: "PAYER_NWC_COMMITMENT_REQUIRED" });
    expect(validatePoolCreationGraph(pool, [receivable, commitment, nwc])).toEqual({ valid: false, reason: "CLIENT_APPROVAL_REQUIRED" });
    const inactiveNwc = await signVector(4, originator, { receivable_event_id: receivable.id, authorization_state: "INVALID" });
    const inactivePool = await provider.signEvent(buildProtocolEvent(poolVector.kind as ProtocolKind, { ...poolContent, nwc_attestation_event_id: inactiveNwc.id } as ProtocolContent));
    expect(validatePoolCreationGraph(inactivePool, [receivable, commitment, approval, inactiveNwc])).toEqual({ valid: false, reason: "ACTIVE_NWC_ATTESTATION_REQUIRED" });
  });

  it("allows another client to approve after a different client rejected", async () => {
    const otherClient = new FakeSigner(new Uint8Array(32).fill(13));
    const receivable = await signVector(1, provider);
    const rejected = await signVector(3, otherClient, { receivable_event_id: receivable.id, decision: "REJECTED" });
    const originatorPubkey = await originator.getPublicKey();
    const commitment = await signVector(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey });
    const approval = await signVector(3, originator, { receivable_event_id: receivable.id });
    const nwc = await signVector(4, originator, { receivable_event_id: receivable.id });
    const poolVector = validContentVectors[5]!;
    const pool = await provider.signEvent(buildProtocolEvent(poolVector.kind as ProtocolKind, { ...poolVector.content, receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id, approval_event_id: approval.id, nwc_attestation_event_id: nwc.id, originator_pubkey: originatorPubkey } as ProtocolContent));
    expect(validatePoolCreationGraph(pool, [receivable, rejected, commitment, approval, nwc])).toMatchObject({ valid: true });
  });

  it("accepts a commitment with has_nwc_authorization=false when a valid NwcAuthorizationAttestation is present", async () => {
    const originatorPubkey = await originator.getPublicKey();
    const receivable = await signVector(1, provider);
    const commitment = await signVector(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey, has_nwc_authorization: false });
    const approval = await signVector(3, originator, { receivable_event_id: receivable.id });
    const nwc = await signVector(4, originator, { receivable_event_id: receivable.id });
    const poolVector = validContentVectors[5]!;
    const pool = await provider.signEvent(buildProtocolEvent(poolVector.kind as ProtocolKind, { ...poolVector.content, receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id, approval_event_id: approval.id, nwc_attestation_event_id: nwc.id, originator_pubkey: originatorPubkey } as ProtocolContent));
    expect(validatePoolCreationGraph(pool, [receivable, commitment, approval, nwc])).toMatchObject({ valid: true });
  });

  it("rejects an NwcAuthorizationAttestation belonging to a different receivable", async () => {
    const originatorPubkey = await originator.getPublicKey();
    const receivable = await signVector(1, provider);
    const otherReceivable = await signVector(1, provider, { receivable_id: "receivable_other_0001" });
    const commitment = await signVector(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey });
    const approval = await signVector(3, originator, { receivable_event_id: receivable.id });
    const nwcForOther = await signVector(4, originator, { receivable_event_id: otherReceivable.id });
    const poolVector = validContentVectors[5]!;
    const pool = await provider.signEvent(buildProtocolEvent(poolVector.kind as ProtocolKind, { ...poolVector.content, receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id, approval_event_id: approval.id, nwc_attestation_event_id: nwcForOther.id, originator_pubkey: originatorPubkey } as ProtocolContent));
    expect(validatePoolCreationGraph(pool, [receivable, otherReceivable, commitment, approval, nwcForOther])).toEqual({ valid: false, reason: "RECEIVABLE_REFERENCE_MISMATCH" });
  });

  it("rejects a revoked NwcAuthorizationAttestation", async () => {
    const originatorPubkey = await originator.getPublicKey();
    const receivable = await signVector(1, provider);
    const commitment = await signVector(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey });
    const approval = await signVector(3, originator, { receivable_event_id: receivable.id });
    const revokedNwc = await signVector(4, originator, { receivable_event_id: receivable.id, authorization_state: "REVOKED" });
    const poolVector = validContentVectors[5]!;
    const pool = await provider.signEvent(buildProtocolEvent(poolVector.kind as ProtocolKind, { ...poolVector.content, receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id, approval_event_id: approval.id, nwc_attestation_event_id: revokedNwc.id, originator_pubkey: originatorPubkey } as ProtocolContent));
    expect(validatePoolCreationGraph(pool, [receivable, commitment, approval, revokedNwc])).toEqual({ valid: false, reason: "ACTIVE_NWC_ATTESTATION_REQUIRED" });
  });

  it("rejects when the NwcAuthorizationAttestation executor diverges from the pool originator", async () => {
    const originatorPubkey = await originator.getPublicKey();
    const rogue = new FakeSigner(new Uint8Array(32).fill(77));
    const roguePubkey = await rogue.getPublicKey();
    const receivable = await signVector(1, provider);
    const commitment = await signVector(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey });
    const approval = await signVector(3, originator, { receivable_event_id: receivable.id });
    const nwcVector = validContentVectors[4]!;
    const nwcContent = { ...nwcVector.content, receivable_event_id: receivable.id, executor_pubkey: roguePubkey } as ProtocolContent;
    const nwc = await rogue.signEvent(buildProtocolEvent(nwcVector.kind as ProtocolKind, nwcContent));
    const poolVector = validContentVectors[5]!;
    const pool = await provider.signEvent(buildProtocolEvent(poolVector.kind as ProtocolKind, { ...poolVector.content, receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id, approval_event_id: approval.id, nwc_attestation_event_id: nwc.id, originator_pubkey: originatorPubkey } as ProtocolContent));
    expect(validatePoolCreationGraph(pool, [receivable, commitment, approval, nwc])).toEqual({ valid: false, reason: "ORIGINATOR_AUTHORITY_MISMATCH" });
  });

  it("accepts a graph with a distinct safe_fingerprint when the NwcAuthorizationAttestation is otherwise valid", async () => {
    const originatorPubkey = await originator.getPublicKey();
    const receivable = await signVector(1, provider);
    const commitment = await signVector(2, originator, { receivable_event_id: receivable.id, originator_pubkey: originatorPubkey });
    const approval = await signVector(3, originator, { receivable_event_id: receivable.id });
    const nwcVector = validContentVectors[4]!;
    const nwcContent = { ...nwcVector.content, receivable_event_id: receivable.id, executor_pubkey: originatorPubkey, safe_fingerprint: "9".repeat(64) } as ProtocolContent;
    const nwc = await originator.signEvent(buildProtocolEvent(nwcVector.kind as ProtocolKind, nwcContent));
    const poolVector = validContentVectors[5]!;
    const pool = await provider.signEvent(buildProtocolEvent(poolVector.kind as ProtocolKind, { ...poolVector.content, receivable_event_id: receivable.id, payer_commitment_event_id: commitment.id, approval_event_id: approval.id, nwc_attestation_event_id: nwc.id, originator_pubkey: originatorPubkey } as ProtocolContent));
    const result = validatePoolCreationGraph(pool, [receivable, commitment, approval, nwc]);
    expect(result).toMatchObject({ valid: true });
  });
});
