import { NextResponse } from "next/server";
import { z } from "zod";

import { issueNostrLinkChallenge } from "@/db/repositories/nostr-auth-repository";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
const schema = z.object({ pubkey: z.string().regex(/^[a-f0-9]{64}$/) });
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertJsonPayloadSize(request);
    const body = schema.parse(await request.json()); enforceRateLimit(`protocol:identity:${body.pubkey}`, 6);
    const result = await withSessionProfile(request, ({ profile, db }) => issueNostrLinkChallenge(db, { userId: profile.userId, pubkey: body.pubkey, requestUrl: new URL("/api/protocol/identity/complete", request.url).toString() }));
    return NextResponse.json({ ...result, expiresAt: result.expiresAt.toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: "Não foi possível preparar o vínculo Nostr." }, { status: 400, headers });
  }
}
