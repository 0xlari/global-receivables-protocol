// @vitest-environment node

import { describe, expect, it } from "vitest";

import { assertJsonPayloadSize, assertSameOrigin } from "./api-security";

describe("payment API security", () => {
  it("accepts only same-origin writes", () => {
    expect(() => assertSameOrigin(new Request("https://app.example/api/write", { headers: { origin: "https://app.example" } }))).not.toThrow();
    expect(() => assertSameOrigin(new Request("https://app.example/api/write", { headers: { origin: "https://evil.example" } }))).toThrow();
    expect(() => assertSameOrigin(new Request("https://app.example/api/write"))).toThrow();
  });

  it("rejects oversized bodies before parsing", () => {
    expect(() => assertJsonPayloadSize(new Request("https://app.example/api/write", { headers: { "content-length": "9000" } }))).toThrow();
  });
});
