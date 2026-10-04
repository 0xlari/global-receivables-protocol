// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateLnurlChallenge, completeLnurlAuthChallenge, findActiveSession, findActiveSessionProfile, issueLnurlAuthChallenge } from "@/db/repositories/lnurl-auth-repository";
import { sha256Hex } from "@/domain/lnurl-auth";
import * as schema from "@/db/schema";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;

describe("LNURL-auth persistence", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => postgres.close());

  it("creates one account, consumes the challenge and issues one hashed session", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const challenge = await issueLnurlAuthChallenge(database, { callbackBaseUrl: "https://auth.agendacryptoo.com", now });
    const k1 = new URL(challenge.callbackUrl).searchParams.get("k1")!;
    const pending = await completeLnurlAuthChallenge(database, { challengeId: challenge.challengeId, pollToken: challenge.pollToken, now });
    expect(pending.status).toBe("PENDING");

    const authenticated = await authenticateLnurlChallenge(database, { k1, linkingKeyHash: sha256Hex("domain-wallet-key"), now });
    const completed = await completeLnurlAuthChallenge(database, { challengeId: challenge.challengeId, pollToken: challenge.pollToken, now });
    expect(completed.status).toBe("AUTHENTICATED");
    if (completed.status !== "AUTHENTICATED") throw new Error("expected session");
    expect(completed.userId).toBe(authenticated.userId);
    expect(await findActiveSession(database, completed.sessionToken, now)).toMatchObject({ userId: authenticated.userId });
    expect(await findActiveSessionProfile(database, completed.sessionToken, now)).toMatchObject({ userId: authenticated.userId });

    const rows = await postgres.query<{ token_hash: string; reputation_id: string }>("select s.token_hash, u.reputation_id::text from app_sessions s join users u on u.id = s.user_id");
    expect(rows.rows[0]?.token_hash).not.toBe(completed.sessionToken);
    expect(rows.rows[0]?.reputation_id).toMatch(/^[a-f0-9-]{36}$/);
    await expect(completeLnurlAuthChallenge(database, { challengeId: challenge.challengeId, pollToken: challenge.pollToken, now })).rejects.toThrow("ALREADY_COMPLETED");
    await expect(authenticateLnurlChallenge(database, { k1, linkingKeyHash: sha256Hex("domain-wallet-key"), now })).rejects.toThrow("ALREADY_USED");
  });

  it("maps the same domain-specific wallet key to the same account", async () => {
    const now = new Date("2026-07-16T13:00:00.000Z");
    const keyHash = sha256Hex("same-domain-wallet-key");
    const first = await issueLnurlAuthChallenge(database, { callbackBaseUrl: "https://auth.agendacryptoo.com", now });
    const second = await issueLnurlAuthChallenge(database, { callbackBaseUrl: "https://auth.agendacryptoo.com", now });
    const firstUser = await authenticateLnurlChallenge(database, { k1: new URL(first.callbackUrl).searchParams.get("k1")!, linkingKeyHash: keyHash, now });
    const secondUser = await authenticateLnurlChallenge(database, { k1: new URL(second.callbackUrl).searchParams.get("k1")!, linkingKeyHash: keyHash, now });
    expect(secondUser.userId).toBe(firstUser.userId);
  });

  it("maps different wallet keys to separate opaque profiles", async () => {
    const now = new Date("2026-07-16T14:00:00.000Z");
    const first = await issueLnurlAuthChallenge(database, { callbackBaseUrl: "https://auth.agendacryptoo.com", now });
    const second = await issueLnurlAuthChallenge(database, { callbackBaseUrl: "https://auth.agendacryptoo.com", now });
    const firstUser = await authenticateLnurlChallenge(database, { k1: new URL(first.callbackUrl).searchParams.get("k1")!, linkingKeyHash: sha256Hex("wallet-a"), now });
    const secondUser = await authenticateLnurlChallenge(database, { k1: new URL(second.callbackUrl).searchParams.get("k1")!, linkingKeyHash: sha256Hex("wallet-b"), now });
    expect(secondUser.userId).not.toBe(firstUser.userId);
    const rows = await postgres.query<{ id: string; reputation_id: string }>("select id, reputation_id::text from users where id in ($1, $2) order by id", [firstUser.userId, secondUser.userId]);
    expect(new Set(rows.rows.map((row) => row.reputation_id)).size).toBe(2);
  });
});
