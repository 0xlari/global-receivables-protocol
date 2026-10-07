import { NextResponse } from "next/server";

import { rotateGrpConfirmationLink } from "@/db/repositories/receivable-repository";
import { DomainError } from "@/domain/errors";
import { assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};

function statusFor(error: unknown) {
  if (error instanceof DomainError) {
    if (error.code === "RECEIVABLE_NOT_FOUND") return 404;
    if (error.code === "CONFIRMATION_LINK_NOT_AVAILABLE") return 409;
    return 400;
  }
  if (error instanceof Error && error.message === "APP_SESSION_REQUIRED") return 401;
  return 500;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ receivableId: string }> },
) {
  try {
    assertSameOrigin(request);
    const { receivableId } = await context.params;

    return await withSessionProfile(request, async ({ profile, db }) => {
      enforceRateLimit(`grp:confirmation-link:${profile.userId}`, 20);
      const now = new Date();
      const result = await rotateGrpConfirmationLink(db, {
        requesterId: profile.userId,
        receivableId,
        now,
        expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        confirmationBaseUrl: new URL(request.url).origin,
      });

      const confirmationUrl = new URL(result.confirmationUrl);
      if (new URL(request.url).searchParams.get("experience") === "erh") {
        confirmationUrl.pathname = "/elas-recebem-hoje/confirmar";
      }

      return NextResponse.json(
        {
          confirmationUrl: confirmationUrl.toString(),
          expiresAt: result.expiresAt.toISOString(),
          confirmationStatus: result.confirmationStatus,
        },
        { headers },
      );
    });
  } catch (error) {
    const message =
      error instanceof DomainError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Não foi possível gerar um novo link.";
    return NextResponse.json(
      { error: message },
      { status: statusFor(error), headers },
    );
  }
}
