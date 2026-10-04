import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import { authenticateLnurlChallenge } from "@/db/repositories/lnurl-auth-repository";
import { verifyLnurlAuthSignature } from "@/domain/lnurl-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  tag: z.literal("login"),
  k1: z.string().regex(/^[a-fA-F0-9]{64}$/),
  key: z.string().regex(/^(02|03)[a-fA-F0-9]{64}$/),
  sig: z.string().regex(/^30[a-fA-F0-9]{12,142}$/).max(144),
});
const headers = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };

export async function GET(request: Request) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse(Object.fromEntries(url.searchParams));
    const verified = verifyLnurlAuthSignature({ k1: parsed.k1, key: parsed.key, signature: parsed.sig });
    bundle = databaseFromEnvironment();
    await authenticateLnurlChallenge(bundle.db, { k1: parsed.k1.toLowerCase(), linkingKeyHash: verified.linkingKeyHash });
    return NextResponse.json({ status: "OK" }, { headers });
  } catch {
    return NextResponse.json({ status: "ERROR", reason: "Desafio inválido, expirado ou já utilizado." }, { headers });
  } finally {
    await bundle?.close();
  }
}
