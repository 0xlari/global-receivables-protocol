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

const schema = z.object({
  signature: z.string().min(32).max(128),
}).strict();

const DEFAULT_GRP_PROGRAM_ID = "CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY";

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

function deriveReceivable(requester: PublicKey, receivableId: string) {
  const program = programId();
  const [receivable] = PublicKey.findProgramAddressSync(
    [Buffer.from("receivable"), requester.toBuffer(), uuidBytes(receivableId)],
    program,
  );
  return { program, receivable };
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
      enforceRateLimit(`grp:delinquency:${profile.userId}`, 12);

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
      if (row.receivable.requesterId !== profile.userId) {
        throw new Error("UNAUTHORIZED_RECEIVABLE");
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
        throw new Error("GRP_DELINQUENCY_TX_NOT_CONFIRMED");
      }

      const requester = new PublicKey(row.requesterWallet);
      const derived = deriveReceivable(requester, receivableId);
      const account = await connection.getAccountInfo(derived.receivable, "confirmed");
      if (!account || !account.owner.equals(derived.program) || account.data.length <= 307) {
        throw new Error("GRP_RECEIVABLE_NOT_FOUND_ON_DEVNET");
      }

      const onchainStatus = account.data[307];
      const nextStatus =
        onchainStatus === 8
          ? "DUE"
          : onchainStatus === 11
            ? "DEFAULTED"
            : null;

      if (!nextStatus) {
        throw new Error("GRP_DELINQUENCY_STATE_NOT_APPLIED");
      }

      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(receivables)
          .set({ status: nextStatus, updatedAt: now })
          .where(eq(receivables.id, receivableId));

        await tx.insert(auditEvents).values({
          id: randomUUID(),
          actorId: profile.userId,
          action: nextStatus === "DEFAULTED" ? "GRP_DEFAULT_RECORDED" : "GRP_OVERDUE_RECORDED",
          targetType: "RECEIVABLE",
          targetId: receivableId,
          correlationId: randomUUID(),
          after: {
            signature: body.signature,
            receivablePda: derived.receivable.toBase58(),
            onchainStatus: nextStatus === "DEFAULTED" ? "DEFAULTED" : "OVERDUE",
          },
        });
      });

      return NextResponse.json({
        status: nextStatus,
        onchainStatus: nextStatus === "DEFAULTED" ? "DEFAULTED" : "OVERDUE",
      });
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "GRP_DELINQUENCY_REQUEST_INVALID"
        : error instanceof Error
          ? error.message
          : "GRP_DELINQUENCY_FAILED";

    const status =
      message === "APP_SESSION_REQUIRED" ? 401 :
      message === "UNAUTHORIZED_RECEIVABLE" ? 403 :
      message === "RECEIVABLE_NOT_FOUND" ? 404 :
      400;

    return NextResponse.json({ error: message }, { status });
  }
}
