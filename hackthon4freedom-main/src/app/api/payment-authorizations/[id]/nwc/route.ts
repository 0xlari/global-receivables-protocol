import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import { currentLrpModePolicy } from "@/config/lrp-mode";
import { connectNwcAuthorization } from "@/db/repositories/payer-payment-repository";
import { DomainError } from "@/domain/errors";
import { nwcValidationGatewayFromEnvironment } from "@/integrations/nwc/gateway-factory";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { prepareNwcAuthorizationAttestation } from "@/services/lrp-nwc-attestation-service";

export const runtime = "nodejs";
const bodySchema = z.object({ managementToken: z.string().min(32).max(128), nwcUri: z.string().min(1).max(4096) });
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

function safeConnectionResponse(result: { status: "ACTIVE"; supportedMethods: readonly string[]; fingerprint: string; environment: "SIMULATION" }) {
  return { status: result.status, supportedMethods: result.supportedMethods, fingerprint: result.fingerprint, environment: result.environment };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    assertSameOrigin(request); assertJsonPayloadSize(request);
    const { id } = await context.params; enforceRateLimit(`payment-auth:nwc:${id}`, 6);
    const body = bodySchema.parse(await request.json());
    bundle = databaseFromEnvironment();
    const now = new Date();
    const policy = currentLrpModePolicy();
    const result = await connectNwcAuthorization(bundle.db, nwcValidationGatewayFromEnvironment(), {
      publicId: id, managementToken: body.managementToken, nwcUri: body.nwcUri, now,
      protectRelayMetadata: policy.mode !== "LEGACY",
    });
    if (policy.mode === "LEGACY") {
      return NextResponse.json(safeConnectionResponse(result), { headers });
    }
    try {
      const prepared = await prepareNwcAuthorizationAttestation(bundle.db, {
        receivableId: result.receivableId,
        mode: policy.mode,
        originatorPubkey: process.env.LRP_ORIGINATOR_PUBKEY?.trim().toLowerCase() || undefined,
        now,
      });
      return NextResponse.json({ ...safeConnectionResponse(result), lrp: { status: prepared.status, signatureRequired: prepared.status === "CANDIDATE_READY" } }, { headers });
    } catch (error) {
      if (error instanceof Error && error.message === "LRP_NWC_PRIVATE_AUTHORIZATION_NOT_FOUND") {
        return NextResponse.json(safeConnectionResponse(result), { headers });
      }
      throw error;
    }
    } catch (error) {
    console.error(
      "NWC_CONNECT_FAILED",
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error,
    );

    const status =
      error instanceof DomainError ||
      error instanceof z.ZodError ||
      error instanceof TypeError
        ? 400
        : 500;

    return NextResponse.json(
      {
        error:
          status === 500
            ? "Serviço temporariamente indisponível."
            : "Não foi possível validar a conexão NWC.",
      },
      { status, headers },
    );
  } finally {
    await bundle?.close();
  }
}
