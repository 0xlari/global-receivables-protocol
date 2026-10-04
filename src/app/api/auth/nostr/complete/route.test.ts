// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ close: vi.fn(), complete: vi.fn() }));
vi.mock("@/db/client", () => ({ databaseFromEnvironment: () => ({ db: {}, close: mocks.close }) }));
vi.mock("@/db/repositories/nostr-auth-repository", () => ({ completeNostrLogin: mocks.complete }));

import { POST } from "./route";

const event = { id: "a".repeat(64), pubkey: "b".repeat(64), created_at: 1_784_048_400, kind: 27235, tags: [["purpose", "LOGIN"]], content: "", sig: "c".repeat(128) };

describe("POST /api/auth/nostr/complete", () => {
  beforeEach(() => { mocks.close.mockReset(); mocks.complete.mockReset(); });

  it("sets the existing HttpOnly application session cookie", async () => {
    mocks.complete.mockResolvedValue({ sessionToken: "private-session-token", expiresAt: new Date("2026-07-15T00:00:00Z"), created: true });
    const response = await POST(new Request("https://example.com/api/auth/nostr/complete", {
      method: "POST",
      headers: { origin: "https://example.com", "content-type": "application/json" },
      body: JSON.stringify({ challengeId: "00000000-0000-4000-8000-000000000001", event }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/erh_session=private-session-token;.*HttpOnly.*SameSite=lax/i);
    expect(await response.json()).toEqual({ authenticated: true, created: true });
  });

  it("returns product language for expired and replayed challenges", async () => {
    for (const [code, status, text] of [
      ["NOSTR_CHALLENGE_EXPIRED", 410, "Este acesso expirou"],
      ["NOSTR_CHALLENGE_ALREADY_USED", 409, "já foi utilizada"],
    ] as const) {
      mocks.complete.mockRejectedValueOnce(new Error(code));
      const response = await POST(new Request("https://example.com/api/auth/nostr/complete", { method: "POST", headers: { origin: "https://example.com", "content-type": "application/json" }, body: JSON.stringify({ challengeId: crypto.randomUUID(), event }) }));
      expect(response.status).toBe(status);
      expect((await response.json()).error).toContain(text);
    }
  });
});
