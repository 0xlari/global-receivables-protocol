import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { clientConfirmations, clients, markets, receivableVersions, receivables } from "@/db/schema";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ receivableId: string }> },
) {
  try {
    const { receivableId } = await context.params;
    return await withSessionProfile(request, async ({ profile, db }) => {
      const [row] = await db
        .select({
          id: receivables.id,
          status: receivables.status,
          nominalUsdCents: receivables.nominalAmount,
          dueAt: receivables.dueAt,
          createdAt: receivables.createdAt,
          updatedAt: receivables.updatedAt,
          evidenceHash: receivables.evidenceHash,
          description: receivableVersions.paymentDescription,
          purpose: receivableVersions.paymentPurpose,
          payerCountry: clients.countryCode,
          confirmationStatus: clientConfirmations.status,
          confirmationExpiresAt: clientConfirmations.expiresAt,
          marketId: receivables.marketId,
          marketSlug: markets.slug,
          marketName: markets.name,
        })
        .from(receivables)
        .innerJoin(clients, eq(clients.id, receivables.clientId))
        .innerJoin(
          receivableVersions,
          and(
            eq(receivableVersions.receivableId, receivables.id),
            eq(receivableVersions.version, receivables.version),
          ),
        )
        .leftJoin(markets, eq(markets.id, receivables.marketId))
        .leftJoin(
          clientConfirmations,
          and(
            eq(clientConfirmations.receivableId, receivables.id),
            eq(clientConfirmations.receivableVersion, receivables.version),
          ),
        )
        .where(
          and(
            eq(receivables.id, receivableId),
            eq(receivables.requesterId, profile.userId),
          ),
        )
        .limit(1);

      if (!row) {
        return NextResponse.json({ error: "RECEIVABLE_NOT_FOUND" }, { status: 404, headers });
      }

      return NextResponse.json({
        receivable: {
          id: row.id,
          status: row.status,
          description: row.description,
          purpose: row.purpose,
          payerCountry: row.payerCountry,
          nominalUsdCents: row.nominalUsdCents.toString(),
          dueAt: row.dueAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          evidenceHash: row.evidenceHash,
          confirmationStatus: row.confirmationStatus,
          confirmationExpiresAt: row.confirmationExpiresAt?.toISOString() ?? null,
          marketId: row.marketId,
          marketSlug: row.marketSlug,
          marketName: row.marketName,
        },
      }, { headers });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RECEIVABLE_READ_FAILED";
    const status = message === "APP_SESSION_REQUIRED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status, headers });
  }
}
