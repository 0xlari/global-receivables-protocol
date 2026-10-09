import { randomUUID } from "node:crypto";

import { Connection, PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auditEvents, receivables, users } from "@/db/schema";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GRP_PROGRAM_ID = "CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY";

const schema = z.object({
  signature: z.string().min(32).max(128),
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

function derive(input: { requester: PublicKey; receivableId: string }) {
  const program = programId();
  const [receivable] = PublicKey.findProgramAddressSync(
    [Buffer.from("receivable"), input.requester.toBuffer(), uuidBytes(input.receivableId)],
    program,
  );
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), receivable.toBuffer()],
    program,
  );
  const [settlementDistribution] = PublicKey.findProgramAddressSync(
    [Buffer.from("settlement-distribution"), pool.toBuffer()],
    program,
  );
  return { program, pool, settlementDistribution };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ receivableId: string }> },
) {
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const body = schema.parse(await request.json());
    const { receivableId } = await context.params;

    return await withSessionProfile(request, async ({ profile, db }) => {
      enforceRateLimit(`grp:residual:${profile.userId}`, 8);
      if (!profile.solanaWallet) throw new Error("SOLANA_WALLET_REQUIRED");

      const [row] = await db
        .select({
          requesterId: receivables.requesterId,
          requesterWallet: users.solanaWallet,
        })
        .from(receivables)
        .innerJoin(users, eq(users.id, receivables.requesterId))
        .where(eq(receivables.id, receivableId))
        .limit(1);

      if (!row?.requesterWallet) throw new Error("RECEIVABLE_NOT_FOUND");
      if (
        row.requesterId !== profile.userId ||
        row.requesterWallet !== profile.solanaWallet
      ) {
        throw new Error("REQUESTER_WALLET_REQUIRED");
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
        throw new Error("GRP_RESIDUAL_TX_NOT_CONFIRMED");
      }

      const requester = new PublicKey(profile.solanaWallet);
      const derived = derive({ requester, receivableId });
      const account = await connection.getAccountInfo(
        derived.settlementDistribution,
        "confirmed",
      );
      if (
        !account ||
        !account.owner.equals(derived.program) ||
        account.data.length < 137
      ) {
        throw new Error("GRP_SETTLEMENT_DISTRIBUTION_NOT_FOUND");
      }

      const marketFeeAmount = account.data.readBigUInt64LE(104);
      const protocolFeeAmount = account.data.readBigUInt64LE(112);
      const requesterResidualAmount = account.data.readBigUInt64LE(120);

      await db.insert(auditEvents).values({
        id: randomUUID(),
        actorId: profile.userId,
        action: "GRP_SETTLEMENT_RESIDUAL_CLAIMED",
        targetType: "RECEIVABLE",
        targetId: receivableId,
        correlationId: randomUUID(),
        after: {
          signature: body.signature,
          poolPda: derived.pool.toBase58(),
          settlementDistributionPda: derived.settlementDistribution.toBase58(),
          marketFeeAmountUsdcMinor: marketFeeAmount.toString(),
          protocolFeeAmountUsdcMinor: protocolFeeAmount.toString(),
          requesterResidualAmountUsdcMinor: requesterResidualAmount.toString(),
        },
      });

      return NextResponse.json({
        marketFeeAmountUsdcMinor: marketFeeAmount.toString(),
        protocolFeeAmountUsdcMinor: protocolFeeAmount.toString(),
        requesterResidualAmountUsdcMinor: requesterResidualAmount.toString(),
      });
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "GRP_RESIDUAL_REQUEST_INVALID"
        : error instanceof Error
          ? error.message
          : "GRP_RESIDUAL_CLAIM_FAILED";
    const status =
      message === "APP_SESSION_REQUIRED" ? 401 :
      message === "REQUESTER_WALLET_REQUIRED" ? 403 :
      message === "RECEIVABLE_NOT_FOUND" ? 404 :
      400;

    return NextResponse.json({ error: message }, { status });
  }
}
