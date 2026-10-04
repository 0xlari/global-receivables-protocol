import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import { validateStoredNwcAuthorization } from "@/db/repositories/payer-payment-repository";
import { DomainError } from "@/domain/errors";
import { nwcValidationGatewayFromEnvironment } from "@/integrations/nwc/gateway-factory";
import { assertSameOrigin, enforceRateLimit } from "@/lib/api-security";

const bodySchema = z.object({ managementToken: z.string().min(32).max(128) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    assertSameOrigin(request); const { id } = await context.params; enforceRateLimit(`payment-auth:validate:${id}`, 6);
    const body = bodySchema.parse(await request.json()); bundle = databaseFromEnvironment();
    return NextResponse.json(await validateStoredNwcAuthorization(bundle.db, nwcValidationGatewayFromEnvironment(), { publicId: id, managementToken: body.managementToken, now: new Date() }), { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    const status = error instanceof DomainError || error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? "Serviço temporariamente indisponível." : "A conexão não pôde ser validada." }, { status });
  } finally { await bundle?.close(); }
}
