import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { clients } from "@/db/schema";
import { paymentPurposes } from "@/domain/receivable";
import { submitReceivableWithinTransaction } from "@/db/repositories/receivable-repository";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  paymentDescription: z.string().trim().min(3).max(160),
  paymentPurpose: z.enum(paymentPurposes),
  nominalUsdCents: z.string().regex(/^[1-9][0-9]{0,8}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payerCountry: z.string().regex(/^[A-Z]{2}$/).refine((value) => value !== "BR"),
  evidence: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    extension: z.enum([".pdf", ".png", ".jpg", ".jpeg"]),
    declaredMimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
    byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  }).strict(),
}).strict();

const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "APP_SESSION_REQUIRED") return 401;
  if (message === "ACTIVE_RECEIVABLE_ALREADY_EXISTS") return 409;
  return 400;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const body = bodySchema.parse(await request.json());

    return await withSessionProfile(request, async ({ profile, db }) => {
      enforceRateLimit(`grp:receivable:create:${profile.userId}`, 10);
      if (!profile.solanaWallet) {
        throw new Error("SOLANA_WALLET_REQUIRED");
      }

      const originatorWallet = process.env.NEXT_PUBLIC_GRP_ORIGINATOR_WALLET?.trim();
      if (!originatorWallet) {
        throw new Error("GRP_ORIGINATOR_WALLET_NOT_CONFIGURED");
      }

      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const clientId = randomUUID();
        await tx.insert(clients).values({
          id: clientId,
          countryCode: body.payerCountry,
          protectedContactRef: `grp-private/${randomUUID()}`,
        });

        return submitReceivableWithinTransaction(tx, {
          requesterId: profile.userId,
          clientId,
        paymentDescription: body.paymentDescription,
        paymentPurpose: body.paymentPurpose,
        nominalUsdCents: BigInt(body.nominalUsdCents),
        dueAt: new Date(`${body.dueDate}T12:00:00.000Z`),
        evidence: {
          privateObjectReference: `receivables/${randomUUID()}/evidence`,
          sha256: body.evidence.sha256,
          extension: body.evidence.extension,
          declaredMimeType: body.evidence.declaredMimeType,
          detectedMimeType: body.evidence.declaredMimeType,
          byteSize: body.evidence.byteSize,
          scanStatus: "PENDING",
        },
        now,
        confirmationExpiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          confirmationBaseUrl: new URL(request.url).origin,
        });
      });

      return NextResponse.json({
        receivableId: result.receivableId,
        confirmationUrl: result.confirmationUrl,
        requesterSolanaWallet: profile.solanaWallet,
        evidenceHash: body.evidence.sha256,
        nominalUsdCents: body.nominalUsdCents,
        dueAt: new Date(`${body.dueDate}T12:00:00.000Z`).toISOString(),
        originatorWallet,
      }, { status: 201, headers });
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "GRP_RECEIVABLE_REQUEST_INVALID"
      : error instanceof Error ? error.message : "GRP_RECEIVABLE_CREATION_FAILED";
    return NextResponse.json({ error: message }, { status: statusFor(error), headers });
  }
}
