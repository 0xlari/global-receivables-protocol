import { NextResponse } from "next/server";

import { databaseFromEnvironment } from "@/db/client";
import { readPayerPaymentAuthorization } from "@/db/repositories/payer-payment-repository";
import { DomainError } from "@/domain/errors";
import { enforceRateLimit } from "@/lib/api-security";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    const { id } = await context.params;
    enforceRateLimit(`payment-auth:read:${id}`, 30);
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new DomainError("Token ausente.", "PAYMENT_AUTHORIZATION_ACCESS_DENIED");
    bundle = databaseFromEnvironment();
    return NextResponse.json(await readPayerPaymentAuthorization(bundle.db, id, token), { headers });
  } catch (error) {
    const status = error instanceof DomainError ? 404 : 500;
    return NextResponse.json({ error: status === 404 ? "Autorização não encontrada." : "Serviço temporariamente indisponível." }, { status, headers });
  } finally { await bundle?.close(); }
}
