import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import { issueNostrLoginChallenge } from "@/db/repositories/nostr-auth-repository";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ pubkey: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const privateHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const body = bodySchema.parse(await request.json());
    enforceRateLimit(`auth:nostr:challenge:${body.pubkey}`, 6);
    bundle = databaseFromEnvironment();
    const result = await issueNostrLoginChallenge(bundle.db, {
      pubkey: body.pubkey,
      requestUrl: new URL("/api/auth/nostr/complete", request.url).toString(),
    });
    return NextResponse.json({ ...result, expiresAt: result.expiresAt.toISOString() }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Não foi possível gerar uma solicitação de acesso agora." }, { status: 400, headers: privateHeaders });
  } finally {
    await bundle?.close();
  }
}
