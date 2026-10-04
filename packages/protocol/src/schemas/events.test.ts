import { describe, expect, it } from "vitest";

import { canonicalJson } from "../canonical-json";
import { protocolContentSchemas } from "./events";
import { validContentVectors } from "../test-vectors/valid";

describe("LRP event schemas", () => {
  it.each(validContentVectors)("accepts $content.event_type", ({ kind, content }) => {
    const schema = protocolContentSchemas[kind as keyof typeof protocolContentSchemas];
    expect(schema).toBeDefined();
    expect(schema!.safeParse(content).success).toBe(true);
  });

  it("serializes canonical JSON recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 }, list: [{ d: 4, c: 5 }] })).toBe(
      '{"a":{"b":3,"y":2},"list":[{"c":5,"d":4}],"z":1}',
    );
  });

  it("rejects unsafe monetary numbers and unknown fields", () => {
    expect(() => canonicalJson({ amount: Number.MAX_SAFE_INTEGER + 1 })).toThrow("CANONICAL_JSON_UNSAFE_NUMBER");
    const receivable = validContentVectors.find((item) => item.content.event_type === "ReceivableCreated")!;
    const result = protocolContentSchemas[receivable.kind as keyof typeof protocolContentSchemas].safeParse({ ...receivable.content, email: "private@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid NWC lifetime and mutable pool thresholds", () => {
    const nwc = validContentVectors.find((item) => item.content.event_type === "NwcAuthorizationAttestation")!;
    expect(protocolContentSchemas[nwc.kind as keyof typeof protocolContentSchemas].safeParse({ ...nwc.content, expires_at: 1 }).success).toBe(false);
    const pool = validContentVectors.find((item) => item.content.event_type === "PoolCreated")!;
    expect(protocolContentSchemas[pool.kind as keyof typeof protocolContentSchemas].safeParse({ ...pool.content, minimum_partial_bps: 4999 }).success).toBe(false);
  });
});
