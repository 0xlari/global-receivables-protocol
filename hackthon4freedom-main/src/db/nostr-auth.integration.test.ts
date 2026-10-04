// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { completeNostrLogin, consumeNostrLinkChallenge, ensureUserForSupabaseAuth, issueNostrLinkChallenge, issueNostrLoginChallenge } from "@/db/repositories/nostr-auth-repository";
import * as schema from "@/db/schema";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;

describe("Nostr reputation link persistence", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => { await postgres.close(); });

  it("links a pubkey to an authenticated Supabase user and consumes the challenge once", async () => {
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    const now = new Date("2026-07-14T12:00:00.000Z");
    const user = await ensureUserForSupabaseAuth(database, { authUserId: "00000000-0000-4000-8000-000000000001", userId: "user-supabase" });
    const challenge = await issueNostrLinkChallenge(database, { userId: user.id, pubkey, requestUrl: "https://example.com/api/nostr-link", now });
    const event = finalizeEvent(challenge.event, secret);
    const linked = await consumeNostrLinkChallenge(database, { userId: user.id, challengeId: challenge.challengeId, event, now });
    const rows = await postgres.query<{ supabase_auth_user_id: string; nostr_pubkey: string }>("select supabase_auth_user_id::text, nostr_pubkey from users where id = 'user-supabase'");
    expect(linked.pubkey).toBe(pubkey);
    expect(rows.rows[0]).toEqual({ supabase_auth_user_id: "00000000-0000-4000-8000-000000000001", nostr_pubkey: pubkey });
    await expect(consumeNostrLinkChallenge(database, { userId: user.id, challengeId: challenge.challengeId, event, now })).rejects.toThrow("ALREADY_USED");
  });
});

describe("Nostr-only product login persistence", () => {
  beforeAll(async () => {
    postgres = new PGlite();
    database = drizzle(postgres, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
  }, 30_000);
  afterAll(async () => { await postgres.close(); });

  it("creates a user and HttpOnly-compatible app session from a valid login proof", async () => {
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    const now = new Date("2026-07-14T12:00:00.000Z");
    const challenge = await issueNostrLoginChallenge(database, { pubkey, requestUrl: "https://example.com/api/auth/nostr/complete", now });
    const result = await completeNostrLogin(database, { challengeId: challenge.challengeId, event: finalizeEvent(challenge.event, secret), now });
    expect(result).toMatchObject({ pubkey, created: true });
    expect(result.sessionToken).not.toContain(pubkey);
    const users = await postgres.query<{ nostr_pubkey: string }>("select nostr_pubkey from users where nostr_pubkey = $1", [pubkey]);
    const sessions = await postgres.query<{ total: string }>("select count(*)::text as total from app_sessions where user_id = $1", [result.userId]);
    expect(users.rows).toEqual([{ nostr_pubkey: pubkey }]);
    expect(sessions.rows[0]?.total).toBe("1");
  });

  it("reuses one account per pubkey, isolates another pubkey and rejects replay", async () => {
    const firstSecret = generateSecretKey();
    const secondSecret = generateSecretKey();
    const firstPubkey = getPublicKey(firstSecret);
    const secondPubkey = getPublicKey(secondSecret);
    const now = new Date("2026-07-14T12:10:00.000Z");
    const first = await issueNostrLoginChallenge(database, { pubkey: firstPubkey, requestUrl: "https://example.com/api/auth/nostr/complete", now });
    const firstEvent = finalizeEvent(first.event, firstSecret);
    const firstResult = await completeNostrLogin(database, { challengeId: first.challengeId, event: firstEvent, now });
    await expect(completeNostrLogin(database, { challengeId: first.challengeId, event: firstEvent, now })).rejects.toThrow();
    const again = await issueNostrLoginChallenge(database, { pubkey: firstPubkey, requestUrl: "https://example.com/api/auth/nostr/complete", now });
    const againResult = await completeNostrLogin(database, { challengeId: again.challengeId, event: finalizeEvent(again.event, firstSecret), now });
    const second = await issueNostrLoginChallenge(database, { pubkey: secondPubkey, requestUrl: "https://example.com/api/auth/nostr/complete", now });
    const secondResult = await completeNostrLogin(database, { challengeId: second.challengeId, event: finalizeEvent(second.event, secondSecret), now });
    expect(againResult.userId).toBe(firstResult.userId);
    expect(againResult.created).toBe(false);
    expect(secondResult.userId).not.toBe(firstResult.userId);
  });

  it("does not consume an expired challenge or remove historical sessions", async () => {
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    const issuedAt = new Date("2026-07-14T12:20:00.000Z");
    const historical = await postgres.query<{ total: string }>("select count(*)::text as total from app_sessions");
    const challenge = await issueNostrLoginChallenge(database, { pubkey, requestUrl: "https://example.com/api/auth/nostr/complete", now: issuedAt });
    await expect(completeNostrLogin(database, { challengeId: challenge.challengeId, event: finalizeEvent(challenge.event, secret), now: new Date(issuedAt.getTime() + 60_000) })).rejects.toThrow("EXPIRED");
    const after = await postgres.query<{ total: string }>("select count(*)::text as total from app_sessions");
    expect(after.rows[0]?.total).toBe(historical.rows[0]?.total);
  });
});
