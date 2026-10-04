import { describe, expect, it } from "vitest";

import {
  PROTOCOL_KINDS,
  V0_1_IMPLEMENTED_KIND_NAMES,
  V0_1_RESERVED_KIND_NAMES,
} from "./kinds";
import { LRP_ACRONYM, LRP_EVENT_VERSION, LRP_IDENTIFIER, LRP_IS_EXPERIMENTAL, LRP_NAME, LRP_RELEASE } from "./version";

describe("experimental LRP catalog", () => {
  it("keeps the approved kind values exact and unique", () => {
    expect(PROTOCOL_KINDS).toEqual({
      PROTOCOL_DEFINITION: 8100,
      RECEIVABLE_CREATED: 8101,
      PAYER_COMMITMENT_PROOF: 8102,
      CLIENT_VALIDATION_DECISION: 8103,
      NWC_AUTHORIZATION_ATTESTATION: 8104,
      POOL_CREATED: 8105,
      CONTRIBUTION_INTENT: 8106,
      CONTRIBUTION_FUNDED: 8107,
      POOL_TRANSITION: 8108,
      ORACLE_ATTESTATION: 8109,
      REPAYMENT_SETTLEMENT: 8110,
      DISTRIBUTION_RECEIPT: 8111,
      REPUTATION_FACT: 8112,
      POOL_REFERRAL: 8113,
      DISPUTE_EVENT: 8114,
    });
    expect(new Set(Object.values(PROTOCOL_KINDS))).toHaveLength(15);
  });

  it("separates this slice from kinds reserved for later versions", () => {
    expect(V0_1_IMPLEMENTED_KIND_NAMES).toHaveLength(7);
    expect(V0_1_RESERVED_KIND_NAMES).toHaveLength(8);
    expect(new Set([...V0_1_IMPLEMENTED_KIND_NAMES, ...V0_1_RESERVED_KIND_NAMES])).toHaveLength(15);
  });

  it("exposes the canonical LRP v0.1 identity", () => {
    expect(LRP_NAME).toBe("Lightning Receivables Protocol");
    expect(LRP_ACRONYM).toBe("LRP");
    expect(LRP_RELEASE).toBe("LRP v0.1");
    expect(LRP_IDENTIFIER).toBe("lrp");
    expect(LRP_EVENT_VERSION).toBe("lrp/0.1.0");
    expect(LRP_IS_EXPERIMENTAL).toBe(true);
  });
});
