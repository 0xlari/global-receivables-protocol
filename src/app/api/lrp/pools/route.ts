import { NextResponse } from "next/server";

import { lrpOriginationModeFromEnvironment } from "@/config/lrp-mode";
import { databaseFromEnvironment } from "@/db/client";
import { readLrpPoolProjections } from "@/services/lrp-pool-read-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const poolId = url.searchParams.get("poolId")?.trim() || undefined;
  const canonicalOnly = url.searchParams.get("canonical") === "1";
  const mode = lrpOriginationModeFromEnvironment();
  if (mode === "LEGACY" && !poolId && !canonicalOnly) {
    return NextResponse.json({ error: "LRP_POOL_READ_DISABLED_IN_LEGACY" }, { status: 404, headers });
  }

  let database: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    database = databaseFromEnvironment();
    const result = await readLrpPoolProjections(database.db, { poolId, canonicalOnly });
    const status = result.status === "UNAVAILABLE" ? 503
      : poolId && result.pools.length === 0 ? 404
        : 200;
    return NextResponse.json({ mode, ...result }, { status, headers });
  } catch {
    return NextResponse.json({ mode, status: "UNAVAILABLE", pools: [], issues: ["DATABASE_UNAVAILABLE"] }, { status: 503, headers });
  } finally {
    await database?.close();
  }
}
