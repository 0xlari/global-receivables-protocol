import { randomUUID } from "node:crypto";

import { Connection, PublicKey } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auditEvents, receivables } from "@/db/schema";
import { ERH_MARKET_RULES, calculateErhTargetUsdcMinor } from "@/config/erh-market-rules";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GRP_PROGRAM_ID = "CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY";

const bodySchema = z.object({
  signature: z.string().min(32).max(128),
  targetAmountUsdcMinor: z.string().regex(/^[1-9][0-9]*$/),
  minimumPartialBps: z.number().int().min(0).max(10_000),
  discountBps: z.number().int().min(0).max(10_000),
  fundingDeadlineUnix: z.string().regex(/^[1-9][0-9]*$/),
}).strict();

function programId() {
  return new PublicKey(
    process.env.NEXT_PUBLIC_GRP_PROGRAM_ID?.trim() || DEFAULT_GRP_PROGRAM_ID,
  );
}

function rpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
}

function uuidBytes(value: string) {
  const hex = value.replaceAll("-", "");
  if (!/^[a-f0-9]{32}$/i.test(hex)) throw new Error("GRP_RECEIVABLE_ID_INVALID");
  return Buffer.from(hex, "hex");
}

function poolPda(requester: PublicKey, receivableId: string) {
  const program = programId();
  const [receivable] = PublicKey.findProgramAddressSync(
    [Buffer.from("receivable"), requester.toBuffer(), uuidBytes(receivableId)],
    program,
  );
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), receivable.toBuffer()],
    program,
  );
  return { program, pool };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ receivableId: string }> },
) {
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const body = bodySchema.parse(await request.json());
    const { receivableId } = await context.params;

    return await withSessionProfile(request, async ({ profile, db }) => {
      enforceRateLimit(`grp:pool:create:${profile.userId}`, 10);
      if (!profile.solanaWallet) throw new Error("SOLANA_WALLET_REQUIRED");

      const [receivable] = await db
        .select()
        .from(receivables)
        .where(
          and(
            eq(receivables.id, receivableId),
            eq(receivables.requesterId, profile.userId),
          ),
        )
        .limit(1);

      if (!receivable) throw new Error("RECEIVABLE_NOT_FOUND");
      if (receivable.status !== "APPROVED" && receivable.status !== "POOLED") {
        throw new Error("RECEIVABLE_NOT_APPROVED");
      }

      const targetAmount = BigInt(body.targetAmountUsdcMinor);
      const expectedTargetAmount = calculateErhTargetUsdcMinor(receivable.nominalAmount);
      if (
        targetAmount !== expectedTargetAmount ||
        body.minimumPartialBps !== ERH_MARKET_RULES.minimumPartialBps ||
        body.discountBps !== ERH_MARKET_RULES.investorReturnBps
      ) {
        throw new Error("ERH_MARKET_RULES_MISMATCH");
      }

      const fundingDeadlineUnix = BigInt(body.fundingDeadlineUnix);
      const dueUnix = BigInt(Math.floor(receivable.dueAt.getTime() / 1000));
      if (fundingDeadlineUnix >= dueUnix) {
        throw new Error("INVALID_FUNDING_DEADLINE");
      }

      const connection = new Connection(rpcUrl(), "confirmed");
      const signature = await connection.getSignatureStatus(body.signature, {
        searchTransactionHistory: true,
      });
      if (
        !signature.value ||
        signature.value.err ||
        !["confirmed", "finalized"].includes(signature.value.confirmationStatus ?? "")
      ) {
        throw new Error("GRP_POOL_TX_NOT_CONFIRMED");
      }

      const requester = new PublicKey(profile.solanaWallet);
      const derived = poolPda(requester, receivableId);
      const account = await connection.getAccountInfo(derived.pool, "confirmed");
      if (!account || !account.owner.equals(derived.program)) {
        throw new Error("GRP_POOL_NOT_FOUND_ON_DEVNET");
      }

      if (receivable.status !== "POOLED") {
        const now = new Date();
        await db.transaction(async (tx) => {
          await tx
            .update(receivables)
            .set({ status: "POOLED", updatedAt: now })
            .where(eq(receivables.id, receivableId));

          await tx.insert(auditEvents).values({
            id: randomUUID(),
            actorId: profile.userId,
            action: "GRP_POOL_CREATED",
            targetType: "RECEIVABLE",
            targetId: receivableId,
            correlationId: randomUUID(),
            after: {
              signature: body.signature,
              poolPda: derived.pool.toBase58(),
              targetAmountUsdcMinor: body.targetAmountUsdcMinor,
              minimumPartialBps: body.minimumPartialBps,
              discountBps: body.discountBps,
              fundingDeadlineUnix: body.fundingDeadlineUnix,
            },
          });
        });
      }

      return NextResponse.json({
        status: "POOLED",
        poolPda: derived.pool.toBase58(),
        signature: body.signature,
      });
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "GRP_POOL_REQUEST_INVALID"
        : error instanceof Error
          ? error.message
          : "GRP_POOL_CREATE_FAILED";
    const status =
      message === "APP_SESSION_REQUIRED" ? 401 :
      message === "RECEIVABLE_NOT_FOUND" ? 404 :
      message === "RECEIVABLE_NOT_APPROVED" ? 409 :
      400;
    return NextResponse.json({ error: message }, { status });
  }
}
