import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import { completeNostrLogin } from "@/db/repositories/nostr-auth-repository";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  pubkey: z.string().regex(/^[a-f0-9]{64}$/),
  created_at: z.number().int(),
  kind: z.literal(27235),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string().regex(/^[a-f0-9]{128}$/),
}).strict();
const bodySchema = z.object({ challengeId: z.string().uuid(), event: eventSchema }).strict();
const privateHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

function productError(error: unknown) {
  if (!(error instanceof Error)) return { message: "Não foi possível concluir o acesso agora.", status: 400 };
  if (error.message === "NOSTR_CHALLENGE_EXPIRED") return { message: "Este acesso expirou. Gere uma nova solicitação.", status: 410 };
  if (error.message === "NOSTR_CHALLENGE_ALREADY_USED") return { message: "Esta solicitação de acesso já foi utilizada.", status: 409 };
  if (error.message === "NOSTR_PUBKEY_MISMATCH") return { message: "A identidade usada não corresponde à solicitação atual.", status: 400 };
  return { message: "Não foi possível validar esta assinatura. Gere uma nova solicitação.", status: 400 };
}

export async function POST(request: Request) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const body = bodySchema.parse(await request.json());
    enforceRateLimit(`auth:nostr:complete:${body.challengeId}`, 6);
    bundle = databaseFromEnvironment();
    const result = await completeNostrLogin(bundle.db, body);
    const response = NextResponse.json({ authenticated: true, created: result.created }, { headers: privateHeaders });
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
