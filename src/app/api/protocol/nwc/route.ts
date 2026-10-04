import { NextResponse } from "next/server";
import { z } from "zod";

import { prepareProtocolNwcAuthorization, recordProtocolNwcAttestation } from "@/db/repositories/protocol-nwc-repository";
import { nwcValidationGatewayFromEnvironment } from "@/integrations/nwc/gateway-factory";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };
const prepareSchema = z.object({ action: z.literal("prepare"), receivableEventId: z.string().regex(/^[a-f0-9]{64}$/), nwcUri: z.string().max(4096), maxAmountMsat: z.string().regex(/^\d+$/), dueAt: z.string().datetime(), expiresAt: z.string().datetime() }).strict();
const recordSchema = z.object({ action: z.literal("record_attestation"), receivableEventId: z.string().regex(/^[a-f0-9]{64}$/), attestationEventId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertJsonPayloadSize(request); const body = await request.json();
    return await withSessionProfile(request, async ({ profile, db }) => {
      if (!profile.nostrPubkey) throw new Error("PROTOCOL_SIGNER_NOT_LINKED_TO_SESSION");
      enforceRateLimit(`protocol:nwc:${profile.nostrPubkey}`, 6);
      if (body.action === "record_attestation") {
        const input = recordSchema.parse(body);
        return NextResponse.json(await recordProtocolNwcAttestation(db, { ...input, clientPubkey: profile.nostrPubkey! }), { headers });
      }
      const input = prepareSchema.parse(body);
      const result = await prepareProtocolNwcAuthorization(db, nwcValidationGatewayFromEnvironment(), {
        receivableEventId: input.receivableEventId, clientPubkey: profile.nostrPubkey, nwcUri: input.nwcUri,
        maxAmountMsat: BigInt(input.maxAmountMsat), dueAt: new Date(input.dueAt), expiresAt: new Date(input.expiresAt), now: new Date(),
      });
      return NextResponse.json(result, { status: 201, headers });
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? "INVALID_NWC_REQUEST" : error instanceof Error ? error.message : "NWC_PREPARATION_FAILED";
    return NextResponse.json({ error: message }, { status: message === "APP_SESSION_REQUIRED" ? 401 : 400, headers });
  }
}
