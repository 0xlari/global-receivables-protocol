import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import { appSessions, lnurlAuthChallenges, users, walletAuthenticators } from "@/db/schema";
import { APP_SESSION_TTL_MS, createLnurlAuthChallenge, sha256Hex } from "@/domain/lnurl-auth";

export async function issueLnurlAuthChallenge<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  input: { callbackBaseUrl: string; now?: Date },
) {
  const challenge = createLnurlAuthChallenge(input);
  await db.insert(lnurlAuthChallenges).values({
    id: challenge.id,
    k1Hash: challenge.k1Hash,
    pollTokenHash: challenge.pollTokenHash,
    callbackUrl: challenge.callbackUrl,
    callbackDomain: challenge.callbackDomain,
    expiresAt: challenge.expiresAt,
  });
  return {
    challengeId: challenge.id,
    pollToken: challenge.pollToken,
    lnurl: challenge.lnurl,
    callbackUrl: challenge.callbackUrl,
    expiresAt: challenge.expiresAt,
  };
}
export async function authenticateLnurlChallenge<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  input: { k1: string; linkingKeyHash: string; now?: Date },
) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(lnurlAuthChallenges)
      .where(eq(lnurlAuthChallenges.k1Hash, sha256Hex(input.k1))).limit(1);
    if (!challenge) throw new Error("LNURL_CHALLENGE_NOT_FOUND");
    if (challenge.expiresAt <= now) throw new Error("LNURL_CHALLENGE_EXPIRED");
    if (challenge.authenticatedAt) throw new Error("LNURL_CHALLENGE_ALREADY_USED");

    const [existing] = await tx.select().from(walletAuthenticators).where(and(
      eq(walletAuthenticators.domain, challenge.callbackDomain),
      eq(walletAuthenticators.linkingKeyHash, input.linkingKeyHash),
    )).limit(1);
    if (existing?.revokedAt) throw new Error("LNURL_AUTHENTICATOR_REVOKED");

    let userId = existing?.userId;
    if (!userId) {
      userId = randomUUID();
      await tx.insert(users).values({
        id: userId,
        reputationId: randomUUID(),
        countryCode: "BR",
        status: "PENDING",
      });
      await tx.insert(walletAuthenticators).values({
        id: randomUUID(),
        userId,
        domain: challenge.callbackDomain,
        linkingKeyHash: input.linkingKeyHash,
        lastUsedAt: now,
      });
    } else {
      await tx.update(walletAuthenticators).set({ lastUsedAt: now })
        .where(eq(walletAuthenticators.id, existing!.id));
    }

    const consumed = await tx.update(lnurlAuthChallenges).set({
      userId,
      linkingKeyHash: input.linkingKeyHash,
      authenticatedAt: now,
    }).where(and(
      eq(lnurlAuthChallenges.id, challenge.id),
      isNull(lnurlAuthChallenges.authenticatedAt),
      gt(lnurlAuthChallenges.expiresAt, now),
    )).returning({ id: lnurlAuthChallenges.id });
    if (consumed.length !== 1) throw new Error("LNURL_CHALLENGE_ALREADY_USED");
    return { userId };
  });
}

export async function completeLnurlAuthChallenge<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  input: { challengeId: string; pollToken: string; now?: Date },
) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(lnurlAuthChallenges).where(and(
      eq(lnurlAuthChallenges.id, input.challengeId),
      eq(lnurlAuthChallenges.pollTokenHash, sha256Hex(input.pollToken)),
    )).limit(1);
    if (!challenge) throw new Error("LNURL_POLL_UNAUTHORIZED");
    if (challenge.expiresAt <= now) throw new Error("LNURL_CHALLENGE_EXPIRED");
    if (!challenge.authenticatedAt || !challenge.userId) return { status: "PENDING" as const };
    if (challenge.completedAt) throw new Error("LNURL_CHALLENGE_ALREADY_COMPLETED");

    const completed = await tx.update(lnurlAuthChallenges).set({ completedAt: now }).where(and(
      eq(lnurlAuthChallenges.id, challenge.id),
      isNotNull(lnurlAuthChallenges.authenticatedAt),
      isNull(lnurlAuthChallenges.completedAt),
    )).returning({ userId: lnurlAuthChallenges.userId });
    const userId = completed[0]?.userId;
    if (!userId) throw new Error("LNURL_CHALLENGE_ALREADY_COMPLETED");

    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + APP_SESSION_TTL_MS);
    await tx.insert(appSessions).values({
      id: randomUUID(),
      userId,
      tokenHash: sha256Hex(sessionToken),
      expiresAt,
      lastSeenAt: now,
    });
    return { status: "AUTHENTICATED" as const, sessionToken, expiresAt, userId };
  });
}

export async function findActiveSession<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  rawToken: string,
  now = new Date(),
) {
  const [session] = await db.select().from(appSessions).where(and(
    eq(appSessions.tokenHash, sha256Hex(rawToken)),
    isNull(appSessions.revokedAt),
    gt(appSessions.expiresAt, now),
  )).limit(1);
  return session ?? null;
}

export async function findActiveSessionProfile<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  rawToken: string,
  now = new Date(),
) {
  const [profile] = await db.select({
    sessionId: appSessions.id,
    userId: appSessions.userId,
    profileId: users.reputationId,
    nostrPubkey: users.nostrPubkey,
    expiresAt: appSessions.expiresAt,
  }).from(appSessions).innerJoin(users, eq(users.id, appSessions.userId)).where(and(
    eq(appSessions.tokenHash, sha256Hex(rawToken)),
    isNull(appSessions.revokedAt),
    gt(appSessions.expiresAt, now),
  )).limit(1);
  if (!profile) return null;
  return { ...profile, profileId: profile.profileId?.toString() ?? profile.userId };
}

export async function revokeSession<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  rawToken: string,
  now = new Date(),
) {
  await db.update(appSessions).set({ revokedAt: now }).where(and(
    eq(appSessions.tokenHash, sha256Hex(rawToken)),
    isNull(appSessions.revokedAt),
  ));
}
