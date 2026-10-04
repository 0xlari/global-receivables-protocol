import { databaseFromEnvironment } from "@/db/client";
import { findActiveSessionProfile } from "@/db/repositories/lnurl-auth-repository";

export function sessionTokenFromRequest(request: Request) {
  const raw = request.headers.get("cookie")?.match(/(?:^|;\s*)erh_session=([^;]+)/)?.[1];
  return raw ? decodeURIComponent(raw) : undefined;
}

export async function withSessionProfile<T>(request: Request, run: (input: { profile: NonNullable<Awaited<ReturnType<typeof findActiveSessionProfile>>>; db: ReturnType<typeof databaseFromEnvironment>["db"] }) => Promise<T>) {
  const token = sessionTokenFromRequest(request);
  if (!token) throw new Error("APP_SESSION_REQUIRED");
  const bundle = databaseFromEnvironment();
  try {
    const profile = await findActiveSessionProfile(bundle.db, token);
    if (!profile) throw new Error("APP_SESSION_REQUIRED");
    return await run({ profile, db: bundle.db });
  } finally {
    await bundle.close();
  }
}
