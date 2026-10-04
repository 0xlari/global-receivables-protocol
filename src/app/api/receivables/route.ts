import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { protocolSignedEventSchema } from "@protocol/schemas";
import { NostrToolsRelayClient, lrpRelaysFromEnvironment } from "@nostr/relays";
import { currentLrpModePolicy } from "@/config/lrp-mode";
import type { databaseFromEnvironment } from "@/db/client";
import { lrpReceivableOriginations } from "@/db/schema";
import { paymentPurposes } from "@/domain/receivable";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";
import {
  createPrivateReceivableDraft,
  prepareReceivableCandidate,
  publishPreparedReceivable,
} from "@/services/lrp-receivable-origination-service";
import { readLrpProductJourney } from "@/services/lrp-product-read-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateDraftSchema = z.object({
  action: z.literal("create_private"),
  requestKey: z.string().uuid(),
  paymentDescription: z.string().trim().min(3).max(160),
  paymentPurpose: z.enum(paymentPurposes),
  nominalUsdCents: z.string().regex(/^[1-9][0-9]{0,8}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payerName: z.string().trim().min(2).max(160),
  payerCountry: z.string().regex(/^[A-Z]{2}$/).refine((value) => value !== "BR"),
  evidenceName: z.string().trim().min(1).max(180),
  evidence: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    extension: z.enum([".pdf", ".png", ".jpg", ".jpeg"]),
    declaredMimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
    byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  }).strict(),
  publicPseudonym: z.string().trim().min(2).max(60),
}).strict();
const prepareSchema = z.object({ action: z.literal("prepare_candidate"), draftId: z.string().uuid() }).strict();
const publishSchema = z.object({
  action: z.literal("publish"),
  draftId: z.string().uuid(),
  event: protocolSignedEventSchema,
}).strict();
const retrySchema = z.object({ action: z.literal("retry"), draftId: z.string().uuid() }).strict();
const requestSchema = z.discriminatedUnion("action", [privateDraftSchema, prepareSchema, publishSchema, retrySchema]);
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

function relayClients() {
  return lrpRelaysFromEnvironment().map((relay) => new NostrToolsRelayClient(relay));
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : "LRP_RECEIVABLE_CREATION_FAILED";
  if (message === "APP_SESSION_REQUIRED") return 401;
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("CONFLICT") || message === "ACTIVE_RECEIVABLE_ALREADY_EXISTS") return 409;
  return 400;
}

async function assertCanonicalLrpDraft(db: ReturnType<typeof databaseFromEnvironment>["db"], draftId: string, requesterId: string) {
  const [draft] = await db.select({ mode: lrpReceivableOriginations.mode }).from(lrpReceivableOriginations)
    .where(and(eq(lrpReceivableOriginations.id, draftId), eq(lrpReceivableOriginations.requesterId, requesterId)))
    .limit(1);
  if (draft?.mode !== "LRP") throw new Error("LRP_RECEIVABLE_API_DISABLED_IN_LEGACY");
}

export async function GET(request: Request) {
  try {
    const policy = currentLrpModePolicy();
    return await withSessionProfile(request, async ({ profile, db }) => {
      enforceRateLimit(`lrp:receivable:read:${profile.userId}`, 60);
      const canonical = await readLrpProductJourney(db, {
        requesterId: profile.userId,
        mode: "LRP",
      });
      if (canonical.history.length || policy.mode === "LRP") {
        return NextResponse.json({ source: "LRP", ...canonical }, { headers });
      }
      if (policy.mode === "SHADOW") {
        const shadow = await readLrpProductJourney(db, { requesterId: profile.userId, mode: "SHADOW" });
        return NextResponse.json({ source: "SHADOW", ...shadow }, { headers });
      }
      return NextResponse.json({ source: "LEGACY", history: [] }, { headers });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LRP_RECEIVABLE_READ_FAILED";
    return NextResponse.json({ error: message }, { status: statusFor(error), headers });
  }
}

export async function POST(request: Request) {
  let clients: NostrToolsRelayClient[] = [];
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const policy = currentLrpModePolicy();
    const migratingMode = policy.mode === "SHADOW" ? "SHADOW" : "LRP";
    const body = requestSchema.parse(await request.json());
    return await withSessionProfile(request, async ({ profile, db }) => {
      enforceRateLimit(`lrp:receivable:${profile.userId}`, 20);
      if (body.action === "create_private") {
        if (policy.mode === "LEGACY") throw new Error("LRP_RECEIVABLE_API_DISABLED_IN_LEGACY");
        const now = new Date();
        const created = await createPrivateReceivableDraft(db, {
          requestKey: body.requestKey,
          requesterId: profile.userId,
          mode: migratingMode,
          paymentDescription: body.paymentDescription,
          paymentPurpose: body.paymentPurpose,
          nominalUsdCents: BigInt(body.nominalUsdCents),
          dueAt: new Date(`${body.dueDate}T12:00:00.000Z`),
          payerName: body.payerName,
          payerCountry: body.payerCountry,
          evidenceName: body.evidenceName,
          evidence: {
            privateObjectReference: `receivables/${body.requestKey}/evidence`,
            sha256: body.evidence.sha256,
            extension: body.evidence.extension,
            declaredMimeType: body.evidence.declaredMimeType,
            detectedMimeType: body.evidence.declaredMimeType,
            byteSize: body.evidence.byteSize,
            scanStatus: "PENDING",
          },
          publicPseudonym: body.publicPseudonym,
          now,
          confirmationExpiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          confirmationBaseUrl: new URL(request.url).origin,
        });
        if (policy.mode === "SHADOW") {
          const shadow = await prepareReceivableCandidate(db, {
            draftId: created.draftId,
            requesterId: profile.userId,
            providerPubkey: profile.nostrPubkey ?? undefined,
          });
          return NextResponse.json({ ...created, status: shadow.status, divergences: shadow.divergences }, { status: 201, headers });
        }
        return NextResponse.json(created, { status: 201, headers });
      }
      if (body.action === "prepare_candidate") {
        if (policy.mode !== "LRP") await assertCanonicalLrpDraft(db, body.draftId, profile.userId);
        if (!profile.nostrPubkey) throw new Error("LRP_SIGNER_NOT_LINKED_TO_SESSION");
        const prepared = await prepareReceivableCandidate(db, {
          draftId: body.draftId,
          requesterId: profile.userId,
          providerPubkey: profile.nostrPubkey,
        });
        return NextResponse.json(prepared, { headers });
      }
      if (policy.mode !== "LRP") await assertCanonicalLrpDraft(db, body.draftId, profile.userId);
      if (!profile.nostrPubkey) throw new Error("LRP_SIGNER_NOT_LINKED_TO_SESSION");
      clients = relayClients();
      const published = await publishPreparedReceivable(db, {
        draftId: body.draftId,
        requesterId: profile.userId,
        signedEvent: body.action === "publish" ? body.event : undefined,
        clients,
      });
      return NextResponse.json(published, {
        status: published.publicationStatus === "CONFIRMED" ? 201 : 202,
        headers,
      });
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "LRP_RECEIVABLE_REQUEST_INVALID"
      : error instanceof Error ? error.message : "LRP_RECEIVABLE_CREATION_FAILED";
    return NextResponse.json({ error: message }, { status: statusFor(error), headers });
  } finally {
    clients.forEach((client) => client.close());
  }
}
