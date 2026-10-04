import { describe, expect, it } from "vitest";

import {
  currentLrpModePolicy,
  lrpModePolicy,
  lrpOriginationModeFromEnvironment,
} from "./lrp-mode";

describe("LRP origination mode guardrails", () => {
  it("defaults to LEGACY when the flag is absent", () => {
    expect(lrpOriginationModeFromEnvironment({})).toBe("LEGACY");
    expect(currentLrpModePolicy({})).toEqual({
      mode: "LEGACY",
      canonicalPublicSource: "LEGACY",
      publishPublicEvents: false,
      projectPublicEvents: false,
      shadowValidateCandidates: false,
    });
  });

  it("keeps SHADOW on legacy reads and disables relay publication", () => {
    expect(lrpModePolicy("SHADOW")).toMatchObject({
      canonicalPublicSource: "LEGACY",
      publishPublicEvents: false,
      shadowValidateCandidates: true,
    });
  });

  it("enables canonical LRP projection only in LRP mode", () => {
    expect(currentLrpModePolicy({ LRP_ORIGINATION_MODE: "lrp" })).toMatchObject({
      mode: "LRP",
      canonicalPublicSource: "LRP",
      publishPublicEvents: true,
      projectPublicEvents: true,
    });
  });

  it("fails closed for an unknown value", () => {
    expect(() => lrpOriginationModeFromEnvironment({ LRP_ORIGINATION_MODE: "enabled" }))
      .toThrow("LRP_ORIGINATION_MODE_INVALID");
  });
});
