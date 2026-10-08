import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { clientConfirmations, clients, grpReceivableMarkets, markets, receivables, receivableVersions } from "@/db/schema";
import { paymentPurposes } from "@/domain/receivable";
import { submitReceivableWithinTransaction } from "@/db/repositories/receivable-repository";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  experience: z.enum(["GRP", "ERH"]).default("GRP"),
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

export async function GET(request: Request) {
  try {
    return await withSessionProfile(request, async ({ profile, db }) => {
      enforceRateLimit(`grp:receivable:read:${profile.userId}`, 60);

      const marketSlug = new URL(request.url).searchParams.get("market");

      const rows = await db
        .select({
          id: receivables.id,
          status: receivables.status,
          nominalUsdCents: receivables.nominalAmount,
          dueAt: receivables.dueAt,
          createdAt: receivables.createdAt,
          updatedAt: receivables.updatedAt,
          description: receivableVersions.paymentDescription,
          purpose: receivableVersions.paymentPurpose,
          confirmationStatus: clientConfirmations.status,
          confirmationExpiresAt: clientConfirmations.expiresAt,
          marketId: grpReceivableMarkets.marketId,
          marketSlug: markets.slug,
          marketName: markets.name,
        })
        .from(receivables)
        .innerJoin(
          receivableVersions,
          and(
            eq(receivableVersions.receivableId, receivables.id),
            eq(receivableVersions.version, receivables.version),
          ),
        )
        .leftJoin(grpReceivableMarkets, eq(grpReceivableMarkets.receivableId, receivables.id))
        .leftJoin(markets, eq(markets.id, grpReceivableMarkets.marketId))
        .leftJoin(
          clientConfirmations,
          and(
            eq(clientConfirmations.receivableId, receivables.id),
            eq(clientConfirmations.receivableVersion, receivables.version),
          ),
        )
        .where(
          marketSlug
            ? and(eq(receivables.requesterId, profile.userId), eq(markets.slug, marketSlug))
            : eq(receivables.requesterId, profile.userId),
        )
        .orderBy(desc(receivables.createdAt));

      return NextResponse.json(
        {
          receivables: rows.map((row) => ({
            id: row.id,
            status: row.status,
            description: row.description,
            purpose: row.purpose,
            nominalUsdCents: row.nominalUsdCents.toString(),
            dueAt: row.dueAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            confirmationStatus: row.confirmationStatus,
            confirmationExpiresAt: row.confirmationExpiresAt?.toISOString() ?? null,
            marketId: row.marketId,
            marketSlug: row.marketSlug,
            marketName: row.marketName,
          })),
        },
        { headers },
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GRP_RECEIVABLE_READ_FAILED";
    return NextResponse.json(
      { error: message },
      { status: statusFor(error), headers },
    );
  }
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
      const marketId = body.experience === "ERH" ? "market_erh_br_v1" : "market_grp_direct_v1";
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
          marketId,
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

      const confirmationUrl = new URL(result.confirmationUrl);
      if (body.experience === "ERH") {
        confirmationUrl.pathname = "/elas-recebem-hoje/confirmar";
      }

      return NextResponse.json({
        receivableId: result.receivableId,
        confirmationUrl: confirmationUrl.toString(),
        requesterSolanaWallet: profile.solanaWallet,
        evidenceHash: body.evidence.sha256,
        nominalUsdCents: body.nominalUsdCents,
        dueAt: new Date(`${body.dueDate}T12:00:00.000Z`).toISOString(),
        originatorWallet,
        marketId,
        marketSlug: body.experience === "ERH" ? "elas-recebem-hoje" : "grp-direct",
      }, { status: 201, headers });
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "GRP_RECEIVABLE_REQUEST_INVALID"
      : error instanceof Error ? error.message : "GRP_RECEIVABLE_CREATION_FAILED";
    return NextResponse.json({ error: message }, { status: statusFor(error), headers });
  }
}
