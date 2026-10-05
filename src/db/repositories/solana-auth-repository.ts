import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";

import * as schema from "@/db/schema";
import { appSessions, solanaAuthChallenges, users } from "@/db/schema";

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createSolanaLoginMessage(input: {
  wallet: string;
  nonce: string;
  expiresAt: Date;
}) {
  return [
    "Global Receivables Protocol",
    "Sign in to continue.",
    `Wallet: ${input.wallet}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

export async function issueSolanaLoginChallenge<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  input: { wallet: string; now?: Date },
) {
  // Throws for malformed Base58 or non-32-byte keys.
  const wallet = new PublicKey(input.wallet).toBase58();
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  const nonce = randomBytes(32).toString("base64url");
  const message = createSolanaLoginMessage({ wallet, nonce, expiresAt });
  const id = randomUUID();

  await db.insert(solanaAuthChallenges).values({
    id,
    wallet,
    nonceHash: sha256Hex(nonce),
    message,
    expiresAt,
  });

  return { challengeId: id, message, expiresAt };
}

export async function completeSolanaLogin<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  input: { challengeId: string; wallet: string; signatureBase64: string; now?: Date },
) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(solanaAuthChallenges)
      .where(eq(solanaAuthChallenges.id, input.challengeId))
      .limit(1);

    if (!challenge) throw new Error("SOLANA_CHALLENGE_NOT_FOUND");
    if (challenge.usedAt) throw new Error("SOLANA_CHALLENGE_ALREADY_USED");
    if (challenge.expiresAt <= now) throw new Error("SOLANA_CHALLENGE_EXPIRED");

    const wallet = new PublicKey(input.wallet).toBase58();
    if (wallet !== challenge.wallet) throw new Error("SOLANA_WALLET_MISMATCH");

    const signature = Buffer.from(input.signatureBase64, "base64");
    const message = new TextEncoder().encode(challenge.message);
    const publicKeyBytes = new PublicKey(wallet).toBytes();
    if (!ed25519.verify(signature, message, publicKeyBytes)) {
      throw new Error("SOLANA_SIGNATURE_INVALID");
    }

    const consumed = await tx
      .update(solanaAuthChallenges)
      .set({ usedAt: now })
      .where(and(
        eq(solanaAuthChallenges.id, challenge.id),
        isNull(solanaAuthChallenges.usedAt),
        gt(solanaAuthChallenges.expiresAt, now),
      ))
      .returning({ id: solanaAuthChallenges.id });

    if (consumed.length !== 1) throw new Error("SOLANA_CHALLENGE_ALREADY_USED");

    let [user] = await tx.select().from(users).where(eq(users.solanaWallet, wallet)).limit(1);
    let created = false;

    if (!user) {
      const [inserted] = await tx.insert(users).values({
        id: randomUUID(),
        reputationId: randomUUID(),
        countryCode: "BR",
        status: "PENDING",
        solanaWallet: wallet,
      }).onConflictDoNothing({ target: users.solanaWallet }).returning();

      user = inserted ?? (await tx.select().from(users).where(eq(users.solanaWallet, wallet)).limit(1))[0];
      created = Boolean(inserted);
    }

    if (!user) throw new Error("SOLANA_USER_CREATION_FAILED");

    await tx.update(solanaAuthChallenges)
      .set({ userId: user.id })
      .where(eq(solanaAuthChallenges.id, challenge.id));

    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    await tx.insert(appSessions).values({
      id: randomUUID(),
      userId: user.id,
      tokenHash: sha256Hex(rawToken),
      expiresAt,
      lastSeenAt: now,
    });

    return { sessionToken: rawToken, expiresAt, created, userId: user.id, wallet };
  });
}
