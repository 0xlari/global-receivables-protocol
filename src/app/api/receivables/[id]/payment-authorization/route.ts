import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import { createPayerPaymentAuthorization } from "@/db/repositories/payer-payment-repository";
import { DomainError } from "@/domain/errors";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";

export const runtime = "nodejs";
const schema = z.object({
  confirmationToken: z.string().min(32).max(128),
  method: z.enum(["NWC_AUTOMATIC", "MANUAL"]),
  maxAmountMsat: z.string().regex(/^\d{1,13}$/),
  maxFeeMsat: z.string().regex(/^\d{1,10}$/),
});
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const { id } = await context.params;
    enforceRateLimit(`payment-auth:create:${id}`);
    const body = schema.parse(await request.json());
    bundle = databaseFromEnvironment();
    const result = await createPayerPaymentAuthorization(bundle.db, {
      receivableId: id,
      rawConfirmationToken: body.confirmationToken,
      method: body.method,
      maxAmountMsat: BigInt(body.maxAmountMsat),
      maxFeeMsat: BigInt(body.maxFeeMsat),
      now: new Date(),
    });
    return NextResponse.json(result, { status: 201, headers });
  } catch (error) {
    const status = error instanceof DomainError || error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? "Serviço temporariamente indisponível." : "Não foi possível criar a autorização." }, { status, headers });
  } finally { await bundle?.close(); }
}
