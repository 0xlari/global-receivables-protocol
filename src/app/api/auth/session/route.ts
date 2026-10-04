import { NextResponse } from "next/server";

import { databaseFromEnvironment } from "@/db/client";
import { findActiveSessionProfile, revokeSession } from "@/db/repositories/lnurl-auth-repository";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "no-store, private" };

function sessionToken(request: Request) {
  return request.headers.get("cookie")?.match(/(?:^|;\s*)erh_session=([^;]+)/)?.[1];
}

export async function GET(request: Request) {
  const token = sessionToken(request);
  if (!token) return NextResponse.json({ authenticated: false }, { status: 401, headers: privateHeaders });
  const bundle = databaseFromEnvironment();
  try {
    const session = await findActiveSessionProfile(bundle.db, decodeURIComponent(token));
    if (!session) return NextResponse.json({ authenticated: false }, { status: 401, headers: privateHeaders });
    return NextResponse.json({
      authenticated: true,
      profile: {
        id: session.profileId,
        label: `Perfil ${session.profileId.slice(0, 8)}`,
        nostrPubkey: session.nostrPubkey,
      },
    }, { headers: privateHeaders });
  } finally {
    await bundle.close();
  }
}

export async function DELETE(request: Request) {
  const token = sessionToken(request);
  const bundle = databaseFromEnvironment();
  try {
    if (token) await revokeSession(bundle.db, decodeURIComponent(token));
    const response = NextResponse.json({ authenticated: false }, { headers: privateHeaders });
    response.cookies.set("erh_session", "", { httpOnly: true, expires: new Date(0), path: "/", sameSite: "lax" });
    return response;
  } finally {
    await bundle.close();
  }
}
