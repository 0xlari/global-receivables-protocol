import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import { issueSolanaLoginChallenge } from "@/db/repositories/solana-auth-repository";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ wallet: z.string().min(32).max(64) }).strict();
const privateHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const body = bodySchema.parse(await request.json());
    enforceRateLimit(`auth:solana:challenge:${body.wallet}`, 6);
    bundle = databaseFromEnvironment();
    const result = await issueSolanaLoginChallenge(bundle.db, body);
    return NextResponse.json(
      { ...result, expiresAt: result.expiresAt.toISOString() },
      { headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gerar uma solicitação de acesso agora." },
      { status: 400, headers: privateHeaders },
    );
  } finally {
    await bundle?.close();
  }
}
