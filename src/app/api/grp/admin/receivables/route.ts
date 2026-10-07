import { randomUUID } from "node:crypto";

import { Connection } from "@solana/web3.js";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  adminReviews,
  auditEvents,
  clientConfirmations,
  clients,
  receivableVersions,
  receivables,
  users,
  validations,
} from "@/db/schema";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};

const reviewSchema = z.object({
  receivableId: z.string().uuid(),
  decision: z.enum(["APPROVED", "NEEDS_INFORMATION", "REJECTED"]),
  reason: z.string().trim().min(10).max(500),
  signature: z.string().min(32).max(128),
}).strict();

function authorityWallet() {
  return process.env.NEXT_PUBLIC_GRP_ORIGINATOR_WALLET?.trim() ?? "";
}

function rpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
}

function assertGrpAdmin(profile: { solanaWallet?: string | null }) {
  const authority = authorityWallet();
  if (!authority || profile.solanaWallet !== authority) {
    throw new Error("GRP_ADMIN_REQUIRED");
  }
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "APP_SESSION_REQUIRED") return 401;
  if (message === "GRP_ADMIN_REQUIRED") return 403;
  if (message === "GRP_RECEIVABLE_NOT_REVIEWABLE") return 409;
  if (message === "GRP_VALIDATION_TX_NOT_CONFIRMED") return 409;
  return 400;
}

export async function GET(request: Request) {
  try {
    return await withSessionProfile(request, async ({ profile, db }) => {
      assertGrpAdmin(profile);
      enforceRateLimit(`grp:admin:receivables:${profile.userId}`, 60);

      const rows = await db
        .select({
          id: receivables.id,
          status: receivables.status,
          requesterWallet: users.solanaWallet,
          nominalUsdCents: receivables.nominalAmount,
          dueAt: receivables.dueAt,
          evidenceHash: receivables.evidenceHash,
          description: receivableVersions.paymentDescription,
          purpose: receivableVersions.paymentPurpose,
          payerCountry: clients.countryCode,
          confirmationStatus: clientConfirmations.status,
          confirmationExpiresAt: clientConfirmations.expiresAt,
          createdAt: receivables.createdAt,
        })
        .from(receivables)
        .innerJoin(users, eq(users.id, receivables.requesterId))
        .innerJoin(clients, eq(clients.id, receivables.clientId))
        .innerJoin(
          receivableVersions,
          and(
            eq(receivableVersions.receivableId, receivables.id),
            eq(receivableVersions.version, receivables.version),
          ),
        )
        .leftJoin(
          clientConfirmations,
          and(
            eq(clientConfirmations.receivableId, receivables.id),
            eq(clientConfirmations.receivableVersion, receivables.version),
          ),
        )
        .where(eq(receivables.status, "UNDER_VALIDATION"))
        .orderBy(desc(receivables.createdAt));

      return NextResponse.json(
        {
          receivables: rows.map((row) => ({
            id: row.id,
            status: row.status,
            requesterWallet: row.requesterWallet,
            nominalUsdCents: row.nominalUsdCents.toString(),
            dueAt: row.dueAt.toISOString(),
            evidenceHash: row.evidenceHash,
            description: row.description,
            purpose: row.purpose,
            payerCountry: row.payerCountry,
            confirmationStatus: row.confirmationStatus,
            confirmationExpiresAt: row.confirmationExpiresAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
          })),
        },
        { headers },
      );
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GRP_ADMIN_READ_FAILED" },
      { status: statusFor(error), headers },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const body = reviewSchema.parse(await request.json());

    return await withSessionProfile(request, async ({ profile, db }) => {
      assertGrpAdmin(profile);
      enforceRateLimit(`grp:admin:review:${profile.userId}`, 20);

      const connection = new Connection(rpcUrl(), "confirmed");
      const signature = await connection.getSignatureStatus(body.signature, {
        searchTransactionHistory: true,
      });
      const status = signature.value;
      if (!status || status.err || !["confirmed", "finalized"].includes(status.confirmationStatus ?? "")) {
        throw new Error("GRP_VALIDATION_TX_NOT_CONFIRMED");
      }

      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const [receivable] = await tx
          .select()
          .from(receivables)
          .where(eq(receivables.id, body.receivableId))
          .for("update");

        if (!receivable || receivable.status !== "UNDER_VALIDATION") {
          throw new Error("GRP_RECEIVABLE_NOT_REVIEWABLE");
        }

        const validationId = randomUUID();
        const validationStatus =
          body.decision === "APPROVED"
            ? "PASSED"
            : body.decision === "REJECTED"
              ? "FAILED"
              : "NEEDS_REVIEW";
        const nextReceivableStatus =
          body.decision === "APPROVED"
            ? "APPROVED"
            : body.decision === "REJECTED"
              ? "REJECTED"
              : "NEEDS_CORRECTION";

        await tx.insert(validations).values({
          id: validationId,
          receivableId: receivable.id,
          receivableVersion: receivable.version,
          status: validationStatus,
          rulesVersion: "grp-validation-v1",
          results: {
            source: "GRP_ADMIN",
            solanaSignature: body.signature,
            decision: body.decision,
          },
          decisionReason: body.reason,
          reviewedBy: profile.userId,
          updatedAt: now,
        });

        if (body.decision !== "NEEDS_INFORMATION") {
          await tx.insert(adminReviews).values({
            id: randomUUID(),
            validationId,
            reviewerId: profile.userId,
            decision: body.decision === "APPROVED" ? "PASSED" : "FAILED",
            reason: body.reason,
            correlationId: randomUUID(),
          });
        }

        await tx
          .update(receivables)
          .set({ status: nextReceivableStatus, updatedAt: now })
          .where(eq(receivables.id, receivable.id));

        await tx.insert(auditEvents).values({
          id: randomUUID(),
          actorId: profile.userId,
          action: "GRP_RECEIVABLE_REVIEWED",
          targetType: "RECEIVABLE",
          targetId: receivable.id,
          correlationId: randomUUID(),
          after: {
            decision: body.decision,
            reason: body.reason,
            solanaSignature: body.signature,
          },
        });

        return { receivableId: receivable.id, status: nextReceivableStatus };
      });

      return NextResponse.json(result, { headers });
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "GRP_ADMIN_REVIEW_INVALID"
        : error instanceof Error
          ? error.message
          : "GRP_ADMIN_REVIEW_FAILED";
    return NextResponse.json({ error: message }, { status: statusFor(error), headers });
  }
}
