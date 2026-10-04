import { randomUUID } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Event } from "nostr-tools";

import * as schema from "@/db/schema";
import { appSessions, nostrAuthChallenges, users } from "@/db/schema";
import { createNostrChallenge, createSessionToken, NOSTR_SESSION_TTL_SECONDS, validateNostrChallengeEvent } from "@/domain/nostr-auth";

export async function ensureUserForSupabaseAuth<THKT extends PgQueryResultHKT>(db: PgDatabase<THKT, typeof schema>, input: { authUserId: string; userId: string }) {
  const [existing] = await db.select().from(users).where(eq(users.supabaseAuthUserId, input.authUserId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(users).values({ id: input.userId, supabaseAuthUserId: input.authUserId, countryCode: "BR", status: "PENDING" }).returning();
  if (!created) throw new Error("USER_CREATION_FAILED");
  return created;
}

export async function issueNostrLinkChallenge<THKT extends PgQueryResultHKT>(db: PgDatabase<THKT, typeof schema>, input: { userId: string; pubkey: string; requestUrl: string; now?: Date }) {
  const [user] = await db.select({ nostrPubkey: users.nostrPubkey }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw new Error("NOSTR_USER_NOT_FOUND");
  if (user.nostrPubkey && user.nostrPubkey !== input.pubkey) throw new Error("NOSTR_SESSION_PUBKEY_MISMATCH");
  const challenge = createNostrChallenge(input.pubkey, input.requestUrl, input.now);
  await db.insert(nostrAuthChallenges).values({ id: challenge.id, userId: input.userId, pubkey: input.pubkey, nonceHash: challenge.nonceHash, requestUrl: input.requestUrl, expiresAt: challenge.expiresAt });
  return { challengeId: challenge.id, event: challenge.event, expiresAt: challenge.expiresAt };
}

export async function consumeNostrLinkChallenge<THKT extends PgQueryResultHKT>(db: PgDatabase<THKT, typeof schema>, input: { userId: string; challengeId: string; event: Event; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(nostrAuthChallenges).where(eq(nostrAuthChallenges.id, input.challengeId)).limit(1);
    if (!challenge) throw new Error("NOSTR_CHALLENGE_NOT_FOUND");
    if (challenge.userId !== input.userId) throw new Error("NOSTR_CHALLENGE_USER_MISMATCH");
    const [user] = await tx.select({ nostrPubkey: users.nostrPubkey }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) throw new Error("NOSTR_USER_NOT_FOUND");
    if (user.nostrPubkey && user.nostrPubkey !== challenge.pubkey) throw new Error("NOSTR_SESSION_PUBKEY_MISMATCH");
    validateNostrChallengeEvent({ event: input.event, expectedPubkey: challenge.pubkey, expectedNonceHash: challenge.nonceHash, expectedRequestUrl: challenge.requestUrl, expiresAt: challenge.expiresAt, usedAt: challenge.usedAt, now });
    const consumed = await tx.update(nostrAuthChallenges).set({ usedAt: now }).where(and(eq(nostrAuthChallenges.id, challenge.id), isNull(nostrAuthChallenges.usedAt))).returning({ id: nostrAuthChallenges.id });
    if (consumed.length !== 1) throw new Error("NOSTR_CHALLENGE_ALREADY_USED");
    const [linked] = await tx.update(users).set({ nostrPubkey: challenge.pubkey, updatedAt: now }).where(eq(users.id, input.userId)).returning({ id: users.id, pubkey: users.nostrPubkey });
    if (!linked) throw new Error("NOSTR_USER_NOT_FOUND");
    return linked;
  });
}

export async function issueNostrLoginChallenge<THKT extends PgQueryResultHKT>(db: PgDatabase<THKT, typeof schema>, input: { pubkey: string; requestUrl: string; now?: Date }) {
  const challenge = createNostrChallenge(input.pubkey, input.requestUrl, input.now, "LOGIN");
  await db.insert(nostrAuthChallenges).values({
    id: challenge.id,
    pubkey: input.pubkey,
    nonceHash: challenge.nonceHash,
    requestUrl: input.requestUrl,
    expiresAt: challenge.expiresAt,
  });
  return { challengeId: challenge.id, event: challenge.event, expiresAt: challenge.expiresAt };
}

export async function completeNostrLogin<THKT extends PgQueryResultHKT>(db: PgDatabase<THKT, typeof schema>, input: { challengeId: string; event: Event; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(nostrAuthChallenges).where(eq(nostrAuthChallenges.id, input.challengeId)).limit(1);
    if (!challenge || challenge.userId) throw new Error("NOSTR_CHALLENGE_NOT_FOUND");
    validateNostrChallengeEvent({
      event: input.event,
      expectedPubkey: challenge.pubkey,
      expectedNonceHash: challenge.nonceHash,
      expectedRequestUrl: challenge.requestUrl,
      expiresAt: challenge.expiresAt,
      usedAt: challenge.usedAt,
      expectedPurpose: "LOGIN",
      now,
    });
    const consumed = await tx.update(nostrAuthChallenges).set({ usedAt: now }).where(and(
      eq(nostrAuthChallenges.id, challenge.id),
      isNull(nostrAuthChallenges.usedAt),
      gt(nostrAuthChallenges.expiresAt, now),
    )).returning({ id: nostrAuthChallenges.id });
    if (consumed.length !== 1) throw new Error("NOSTR_CHALLENGE_ALREADY_USED");

    let [user] = await tx.select().from(users).where(eq(users.nostrPubkey, challenge.pubkey)).limit(1);
    let created = false;
    if (!user) {
      const [inserted] = await tx.insert(users).values({
        id: randomUUID(),
        reputationId: randomUUID(),
        countryCode: "BR",
        status: "PENDING",
        nostrPubkey: challenge.pubkey,
      }).onConflictDoNothing({ target: users.nostrPubkey }).returning();
      user = inserted ?? (await tx.select().from(users).where(eq(users.nostrPubkey, challenge.pubkey)).limit(1))[0];
      created = Boolean(inserted);
    }
    if (!user) throw new Error("NOSTR_USER_CREATION_FAILED");

    await tx.update(nostrAuthChallenges).set({ userId: user.id }).where(eq(nostrAuthChallenges.id, challenge.id));
    const session = createSessionToken();
    const expiresAt = new Date(now.getTime() + NOSTR_SESSION_TTL_SECONDS * 1000);
    await tx.insert(appSessions).values({
      id: session.id,
      userId: user.id,
      tokenHash: session.tokenHash,
      expiresAt,
      lastSeenAt: now,
    });
    return { sessionToken: session.rawToken, expiresAt, userId: user.id, pubkey: challenge.pubkey, created };
  });
}
