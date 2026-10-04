import { NextResponse } from "next/server";
import QRCode from "qrcode";

import { databaseFromEnvironment } from "@/db/client";
import { issueLnurlAuthChallenge } from "@/db/repositories/lnurl-auth-repository";
import { resolveLnurlAuthBaseUrl } from "@/domain/lnurl-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

function safeErrorMetadata(error: unknown) {
  if (!error || typeof error !== "object") return { name: "UnknownError", code: "UNKNOWN" };
  const candidate = error as { name?: unknown; code?: unknown; cause?: unknown };
  const cause = candidate.cause && typeof candidate.cause === "object"
    ? candidate.cause as { code?: unknown }
    : undefined;

  return {
    name: typeof candidate.name === "string" ? candidate.name : "Error",
    code: typeof candidate.code === "string"
      ? candidate.code
      : typeof cause?.code === "string"
        ? cause.code
        : "UNKNOWN",
  };
}

function safeDatabaseTarget() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    const provider = url.hostname.endsWith(".pooler.supabase.com")
      ? "supabase-pooler"
      : url.hostname.endsWith(".supabase.co")
        ? "supabase-direct"
        : "other";

    return { provider, port: url.port || "default" };
  } catch {
    return { provider: "invalid", port: "unknown" };
  }
}

export async function POST(request: Request) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    const callbackBaseUrl = resolveLnurlAuthBaseUrl(request.url);
    bundle = databaseFromEnvironment();
    const challenge = await issueLnurlAuthChallenge(bundle.db, { callbackBaseUrl });
    const qrDataUrl = await QRCode.toDataURL(challenge.lnurl.toUpperCase(), { errorCorrectionLevel: "M", margin: 2, width: 320 });
    return NextResponse.json({
      challengeId: challenge.challengeId,
      pollToken: challenge.pollToken,
      lnurl: challenge.lnurl,
      qrDataUrl,
      expiresAt: challenge.expiresAt.toISOString(),
      publicHttps: new URL(callbackBaseUrl).protocol === "https:",
    }, { headers: privateHeaders });
  } catch (error) {
    console.error("[lnurl-auth:challenge]", {
      ...safeErrorMetadata(error),
      databaseTarget: safeDatabaseTarget(),
    });
    return NextResponse.json({ error: "Não foi possível preparar o acesso por carteira." }, { status: 503, headers: privateHeaders });
  } finally {
    await bundle?.close();
  }
}
