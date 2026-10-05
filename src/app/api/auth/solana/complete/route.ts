import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import { completeSolanaLogin } from "@/db/repositories/solana-auth-repository";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  wallet: z.string().min(32).max(64),
  signatureBase64: z.string().min(40).max(256),
}).strict();

const privateHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

function productError(error: unknown) {
  if (!(error instanceof Error)) return { message: "Não foi possível concluir o acesso agora.", status: 400 };
  if (error.message === "SOLANA_CHALLENGE_EXPIRED") return { message: "Este acesso expirou. Gere uma nova solicitação.", status: 410 };
  if (error.message === "SOLANA_CHALLENGE_ALREADY_USED") return { message: "Esta solicitação já foi utilizada.", status: 409 };
  if (error.message === "SOLANA_WALLET_MISMATCH") return { message: "A carteira conectada mudou durante a assinatura.", status: 400 };
  return { message: "Não foi possível validar esta assinatura. Gere uma nova solicitação.", status: 400 };
}

export async function POST(request: Request) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const body = bodySchema.parse(await request.json());
    enforceRateLimit(`auth:solana:complete:${body.challengeId}`, 6);
    bundle = databaseFromEnvironment();
    const result = await completeSolanaLogin(bundle.db, body);

    const response = NextResponse.json(
      { authenticated: true, created: result.created, wallet: result.wallet },
      { headers: privateHeaders },
    );

    response.cookies.set("erh_session", result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });

    return response;
  } catch (error) {
    const product = productError(error);
    return NextResponse.json({ error: product.message }, { status: product.status, headers: privateHeaders });
  } finally {
    await bundle?.close();
  }
}
