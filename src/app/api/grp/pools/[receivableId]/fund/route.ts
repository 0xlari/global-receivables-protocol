import { randomUUID } from "node:crypto";

import { Connection, PublicKey } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auditEvents, receivables, users } from "@/db/schema";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GRP_PROGRAM_ID = "CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY";

const bodySchema = z.object({
  signature: z.string().min(32).max(128),
  amountUsdcMinor: z.string().regex(/^[1-9][0-9]*$/),
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

function deriveContribution(input: {
  requester: PublicKey;
  receivableId: string;
  investor: PublicKey;
}) {
  const program = programId();
  const [receivable] = PublicKey.findProgramAddressSync(
    [Buffer.from("receivable"), input.requester.toBuffer(), uuidBytes(input.receivableId)],
    program,
  );
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), receivable.toBuffer()],
    program,
  );
  const [contribution] = PublicKey.findProgramAddressSync(
    [Buffer.from("contribution"), pool.toBuffer(), input.investor.toBuffer()],
    program,
  );
  return { program, pool, contribution };
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
      enforceRateLimit(`grp:pool:fund:${profile.userId}`, 20);
      if (!profile.solanaWallet) throw new Error("SOLANA_WALLET_REQUIRED");

      const [row] = await db
        .select({
          receivable: receivables,
          requesterWallet: users.solanaWallet,
        })
        .from(receivables)
        .innerJoin(users, eq(users.id, receivables.requesterId))
        .where(eq(receivables.id, receivableId))
        .limit(1);

      if (!row?.requesterWallet) throw new Error("RECEIVABLE_NOT_FOUND");
      if (row.receivable.status !== "POOLED") {
        throw new Error("RECEIVABLE_NOT_OPEN_FOR_FUNDING");
      }

      const investor = new PublicKey(profile.solanaWallet);
      const requester = new PublicKey(row.requesterWallet);
      const derived = deriveContribution({ requester, receivableId, investor });

      const connection = new Connection(rpcUrl(), "confirmed");
      const signature = await connection.getSignatureStatus(body.signature, {
        searchTransactionHistory: true,
      });
      if (
        !signature.value ||
        signature.value.err ||
        !["confirmed", "finalized"].includes(signature.value.confirmationStatus ?? "")
      ) {
        throw new Error("GRP_FUND_TX_NOT_CONFIRMED");
      }

      const contribution = await connection.getAccountInfo(
        derived.contribution,
        "confirmed",
      );
      if (!contribution || !contribution.owner.equals(derived.program)) {
        throw new Error("GRP_CONTRIBUTION_NOT_FOUND_ON_DEVNET");
      }

      await db.insert(auditEvents).values({
        id: randomUUID(),
        actorId: profile.userId,
        action: "GRP_POOL_FUNDED",
        targetType: "RECEIVABLE",
        targetId: receivableId,
        correlationId: randomUUID(),
        after: {
          signature: body.signature,
          investorWallet: profile.solanaWallet,
          contributionPda: derived.contribution.toBase58(),
          amountUsdcMinor: body.amountUsdcMinor,
        },
      });

      return NextResponse.json({
        contributionPda: derived.contribution.toBase58(),
        signature: body.signature,
      });
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "GRP_FUND_REQUEST_INVALID"
        : error instanceof Error
          ? error.message
          : "GRP_POOL_FUND_FAILED";
    const status =
      message === "APP_SESSION_REQUIRED" ? 401 :
      message === "RECEIVABLE_NOT_FOUND" ? 404 :
      message === "RECEIVABLE_NOT_OPEN_FOR_FUNDING" ? 409 :
      400;
    return NextResponse.json({ error: message }, { status });
  }
}
