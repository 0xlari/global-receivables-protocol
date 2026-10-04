import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import { completeLnurlAuthChallenge } from "@/db/repositories/lnurl-auth-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const bodySchema = z.object({ challengeId: z.string().uuid(), pollToken: z.string().min(40).max(64) });
const privateHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    const body = bodySchema.parse(await request.json());
    bundle = databaseFromEnvironment();
    const result = await completeLnurlAuthChallenge(bundle.db, body);
    if (result.status === "PENDING") return NextResponse.json(result, { status: 202, headers: privateHeaders });

    const response = NextResponse.json({ status: result.status }, { headers: privateHeaders });
    response.cookies.set("erh_session", result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });
    return response;
  } catch (error) {
    const expired = error instanceof Error && error.message === "LNURL_CHALLENGE_EXPIRED";
    return NextResponse.json({ error: expired ? "O QR expirou. Gere outro para continuar." : "Não foi possível concluir este acesso." }, { status: expired ? 410 : 400, headers: privateHeaders });
  } finally {
    await bundle?.close();
  }
}
