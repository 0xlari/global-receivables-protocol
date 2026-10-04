// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/domain/errors";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
  attestation: vi.fn(),
  gateway: vi.fn(),
}));

vi.mock("@/db/client", () => ({ databaseFromEnvironment: () => ({ db: {}, close: mocks.close }) }));
vi.mock("@/config/lrp-mode", () => ({ currentLrpModePolicy: () => ({ mode: "LRP", canonicalPublicSource: "LRP", publishPublicEvents: true, projectPublicEvents: true, shadowValidateCandidates: false }) }));
vi.mock("@/db/repositories/payer-payment-repository", () => ({ connectNwcAuthorization: mocks.connect }));
vi.mock("@/integrations/nwc/gateway-factory", () => ({ nwcValidationGatewayFromEnvironment: mocks.gateway }));
vi.mock("@/services/lrp-nwc-attestation-service", () => ({ prepareNwcAuthorizationAttestation: mocks.attestation }));

import { POST } from "./route";

const connectionResult = {
  status: "ACTIVE" as const,
  supportedMethods: ["pay_invoice", "get_info"],
  fingerprint: "f".repeat(64),
  receivableId: "receivable-legacy",
  environment: "SIMULATION" as const,
};

function request(body: unknown) {
  return new Request("https://example.com/api/payment-authorizations/abc/nwc", {
    method: "POST",
    headers: { origin: "https://example.com", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = { managementToken: "t".repeat(43), nwcUri: "nostr+walletconnect://x" };

describe("POST /api/payment-authorizations/[id]/nwc", () => {
  beforeEach(() => {
    mocks.close.mockReset();
    mocks.connect.mockReset();
    mocks.attestation.mockReset();
    mocks.gateway.mockReset();
    mocks.gateway.mockReturnValue({});
    mocks.connect.mockResolvedValue(connectionResult);
  });

  it("retorna 200 sem lrp quando o atestado não encontra origination LRP", async () => {
    mocks.attestation.mockRejectedValue(new Error("LRP_NWC_PRIVATE_AUTHORIZATION_NOT_FOUND"));

    const response = await POST(request(validBody), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("ACTIVE");
    expect(json.lrp).toBeUndefined();
    expect(mocks.close).toHaveBeenCalled();
  });

  it("retorna 200 com lrp quando o atestado é preparado", async () => {
    mocks.attestation.mockResolvedValue({ status: "CANDIDATE_READY" });

    const response = await POST(request(validBody), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.lrp).toEqual({ status: "CANDIDATE_READY", signatureRequired: true });
  });

  it("repropaga erros diferentes do atestado como 500", async () => {
    mocks.attestation.mockRejectedValue(new Error("LRP_NWC_ACTIVE_ATTESTATION_BLOCKED"));

    const response = await POST(request(validBody), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(500);
    expect(mocks.close).toHaveBeenCalled();
  });

  it("retorna 400 quando a carteira NWC já está conectada a outra autorização", async () => {
    mocks.connect.mockRejectedValue(new DomainError("Esta carteira NWC já está conectada a outra autorização.", "NWC_CONNECTION_ALREADY_IN_USE"));

    const response = await POST(request(validBody), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(400);
    expect(mocks.close).toHaveBeenCalled();
  });
});
