import { NextResponse } from "next/server";
import { z } from "zod";

import { NostrToolsRelayClient, lrpRelaysFromEnvironment } from "@nostr/relays";
import { protocolSignedEventSchema } from "@protocol/schemas";
import { currentLrpModePolicy } from "@/config/lrp-mode";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";
import { acceptAndPreparePoolCreated, findProviderReceivableForPool, previewPoolCreated, publishPreparedPoolCreated } from "@/services/lrp-pool-origination-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };
const previewSchema = z.object({ action: z.literal("preview"), receivableId: z.string().uuid() }).strict();
const consentSchema = z.object({ action: z.literal("consent"), poolOriginationId: z.string().uuid(), termsHash: z.string().regex(/^[a-f0-9]{64}$/), consent: z.literal(true) }).strict();
const publishSchema = z.object({ action: z.literal("publish"), poolOriginationId: z.string().uuid(), event: protocolSignedEventSchema }).strict();
const retrySchema = z.object({ action: z.literal("retry"), poolOriginationId: z.string().uuid() }).strict();
const bodySchema = z.discriminatedUnion("action", [previewSchema, consentSchema, publishSchema, retrySchema]);

function clients() { return lrpRelaysFromEnvironment().map((relay) => new NostrToolsRelayClient(relay)); }

export async function GET(request: Request) {
  try {
    const policy = currentLrpModePolicy();
    if (policy.mode === "LEGACY") throw new Error("LRP_POOL_API_DISABLED_IN_LEGACY");
    const mode = policy.mode === "SHADOW" ? "SHADOW" : "LRP";
    return await withSessionProfile(request, async ({ profile, db }) => NextResponse.json(await findProviderReceivableForPool(db, profile.userId, mode) ?? {}, { headers }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "LRP_POOL_LOOKUP_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("SESSION") ? 401 : 400, headers });
  }
}

export async function POST(request: Request) {
  let relayClients: NostrToolsRelayClient[] = [];
  try {
    assertSameOrigin(request); assertJsonPayloadSize(request);
    const policy = currentLrpModePolicy();
    if (policy.mode === "LEGACY") throw new Error("LRP_POOL_API_DISABLED_IN_LEGACY");
    const mode = policy.mode === "SHADOW" ? "SHADOW" : "LRP";
    const body = bodySchema.parse(await request.json());
    return await withSessionProfile(request, async ({ profile, db }) => {
      enforceRateLimit(`lrp:pool:${profile.userId}`, 20);
      if (body.action === "preview") return NextResponse.json(await previewPoolCreated(db, { receivableId: body.receivableId, requesterId: profile.userId, mode, now: new Date() }), { status: 201, headers });
      if (body.action === "consent") {
        if (mode === "LRP" && !profile.nostrPubkey) throw new Error("LRP_SIGNER_NOT_LINKED_TO_SESSION");
        return NextResponse.json(await acceptAndPreparePoolCreated(db, { ...body, requesterId: profile.userId, now: new Date() }), { headers });
      }
      if (mode !== "LRP" || !profile.nostrPubkey) throw new Error("LRP_SIGNER_NOT_LINKED_TO_SESSION");
      relayClients = clients();
      const result = await publishPreparedPoolCreated(db, { poolOriginationId: body.poolOriginationId, requesterId: profile.userId, signedEvent: body.action === "publish" ? body.event : undefined, clients: relayClients, now: new Date() });
      return NextResponse.json(result, { status: result.publicationStatus === "CONFIRMED" ? 201 : 202, headers });
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? "LRP_POOL_REQUEST_INVALID" : error instanceof Error ? error.message : "LRP_POOL_REQUEST_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("SESSION") || message.includes("SIGNER") ? 401 : message.includes("NOT_FOUND") ? 404 : message.includes("CONFLICT") || message.includes("ALREADY") ? 409 : 400, headers });
  } finally { relayClients.forEach((client) => client.close()); }
}
