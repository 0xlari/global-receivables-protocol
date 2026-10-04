import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeNostrLinkChallenge } from "@/db/repositories/nostr-auth-repository";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
const eventSchema = z.object({ id: z.string().length(64), pubkey: z.string().length(64), created_at: z.number().int(), kind: z.literal(27235), tags: z.array(z.array(z.string())), content: z.string(), sig: z.string().length(128) }).strict();
const schema = z.object({ challengeId: z.string().uuid(), event: eventSchema });
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertJsonPayloadSize(request); const body = schema.parse(await request.json()); enforceRateLimit(`protocol:identity:complete:${body.challengeId}`, 6);
    const linked = await withSessionProfile(request, ({ profile, db }) => consumeNostrLinkChallenge(db, { userId: profile.userId, challengeId: body.challengeId, event: body.event }));
    return NextResponse.json({ linked: true, pubkey: linked.pubkey }, { headers });
  } catch {
    return NextResponse.json({ error: "Assinatura de vínculo inválida ou expirada." }, { status: 400, headers });
  }
}
