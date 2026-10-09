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
  action: z.enum(["ACCEPT_PARTIAL", "DISBURSE"]),
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
    const body = schema.parse(await request.json());
    const { receivableId } = await context.params;

    return await withSessionProfile(request, async ({ profile, db }) => {
      enforceRateLimit(`grp:pool:release:${profile.userId}`, 12);
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
      if (row.requesterWallet !== profile.solanaWallet) throw new Error("REQUESTER_WALLET_REQUIRED");
      if (row.receivable.status !== "POOLED" && row.receivable.status !== "ADVANCED") {
        throw new Error("RECEIVABLE_NOT_RELEASABLE");
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
        throw new Error("GRP_RELEASE_TX_NOT_CONFIRMED");
      }

      const requester = new PublicKey(profile.solanaWallet);
      const derived = poolPda(requester, receivableId);
      const account = await connection.getAccountInfo(derived.pool, "confirmed");
      if (!account || !account.owner.equals(derived.program) || account.data.length < 189) {
        throw new Error("GRP_POOL_NOT_FOUND_ON_DEVNET");
      }

      const poolStatus = account.data[188];
      if (body.action === "ACCEPT_PARTIAL") {
        if (poolStatus !== 3) {
          throw new Error("GRP_PARTIAL_FUNDING_NOT_ACCEPTED_ONCHAIN");
        }
      } else {
        if (poolStatus !== 5) {
          throw new Error("GRP_DISBURSEMENT_NOT_CONFIRMED_ONCHAIN");
        }

        if (row.receivable.status !== "ADVANCED") {
          await db
            .update(receivables)
            .set({ status: "ADVANCED", updatedAt: new Date() })
            .where(eq(receivables.id, receivableId));
        }
      }

      await db.insert(auditEvents).values({
        id: randomUUID(),
        actorId: profile.userId,
        action:
          body.action === "ACCEPT_PARTIAL"
            ? "GRP_PARTIAL_FUNDING_ACCEPTED"
            : "GRP_POOL_DISBURSED",
        targetType: "RECEIVABLE",
        targetId: receivableId,
        correlationId: randomUUID(),
        after: {
          signature: body.signature,
          poolPda: derived.pool.toBase58(),
          poolStatus,
        },
      });

      return NextResponse.json({
        status: body.action === "DISBURSE" ? "ADVANCED" : "POOLED",
        poolPda: derived.pool.toBase58(),
      });
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "GRP_RELEASE_REQUEST_INVALID"
        : error instanceof Error
          ? error.message
          : "GRP_RELEASE_FAILED";
    const status =
      message === "APP_SESSION_REQUIRED" ? 401 :
      message === "REQUESTER_WALLET_REQUIRED" ? 403 :
      message === "RECEIVABLE_NOT_FOUND" ? 404 :
      message === "RECEIVABLE_NOT_RELEASABLE" ? 409 :
      400;
    return NextResponse.json({ error: message }, { status });
  }
}
