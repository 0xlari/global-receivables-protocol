import { and, desc, eq, notInArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { protocolUnsignedEventSchema, type ProtocolUnsignedEvent } from "@protocol/schemas";
import type { LrpOriginationMode } from "@/config/lrp-mode";
import * as schema from "@/db/schema";
import {
  lrpPoolOriginations,
  lrpReceivableOriginations,
  receivableVersions,
  receivables,
} from "@/db/schema";
import type { ReceivableStatus } from "@/domain/state-machine";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;
type MigratingMode = Exclude<LrpOriginationMode, "LEGACY">;

export type LrpProductNextStep =
  | "CONNECT_IDENTITY"
  | "SIGN_RECEIVABLE"
  | "RETRY_PUBLICATION"
  | "SHARE_CONFIRMATION"
  | "AWAIT_PAYER"
  | "AWAIT_REVIEW"
  | "CREATE_POOL"
  | "REVIEW_POOL"
  | "VIEW_POOL"
  | "NONE";

export type LrpProductReceivable = Readonly<{
  receivableId: string;
  draftId: string;
  privateStatus: ReceivableStatus;
  originationStatus: string;
  canonicalSource: "LEGACY" | "LRP";
  title: string;
  nominalUsdCents: string;
  dueAt: string;
  candidate?: ProtocolUnsignedEvent;
  publicEventId?: string;
  publicationStatus?: "PENDING" | "CONFIRMED";
  confirmationUrl?: string;
  nextStep: LrpProductNextStep;
  pool?: Readonly<{
    poolId: string;
    status: string;
    publicEventId?: string;
    canonicalSource: "LEGACY" | "LRP";
  }>;
}>;

function privateConfirmationUrl(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("confirmationUrl" in payload)) return undefined;
  const value = (payload as { confirmationUrl?: unknown }).confirmationUrl;
  return typeof value === "string" && value.startsWith("http") ? value : undefined;
}

function nextStep(input: {
  originationStatus: string;
  privateStatus: ReceivableStatus;
  poolStatus?: string;
}): LrpProductNextStep {
  if (input.poolStatus === "PUBLISHED" || input.poolStatus === "PROJECTION_PENDING") return "VIEW_POOL";
  if (input.poolStatus) return "REVIEW_POOL";
  if (input.originationStatus === "PRIVATE_DRAFT") return "CONNECT_IDENTITY";
  if (input.originationStatus === "CANDIDATE_READY") return "SIGN_RECEIVABLE";
  if (input.originationStatus === "PUBLICATION_PENDING") return "RETRY_PUBLICATION";
  if (input.privateStatus === "AWAITING_CLIENT") return "SHARE_CONFIRMATION";
  if (input.privateStatus === "UNDER_VALIDATION" || input.privateStatus === "NEEDS_CORRECTION") return "AWAIT_REVIEW";
  if (input.privateStatus === "APPROVED") return "CREATE_POOL";
  if (input.privateStatus === "POOLED") return "VIEW_POOL";
  return "NONE";
}

async function readOne<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  origin: typeof lrpReceivableOriginations.$inferSelect,
): Promise<LrpProductReceivable | undefined> {
  const [privateState] = await db.select({ receivable: receivables, version: receivableVersions })
    .from(receivables)
    .innerJoin(receivableVersions, and(
      eq(receivableVersions.receivableId, receivables.id),
      eq(receivableVersions.version, receivables.version),
    ))
    .where(eq(receivables.id, origin.receivableId))
    .limit(1);
  if (!privateState) return undefined;
  const [pool] = await db.select().from(lrpPoolOriginations)
    .where(and(
      eq(lrpPoolOriginations.receivableId, origin.receivableId),
      eq(lrpPoolOriginations.requesterId, origin.requesterId),
    )).limit(1);
  const candidate = origin.candidateEvent
    ? protocolUnsignedEventSchema.parse(origin.candidateEvent)
    : undefined;
  const confirmationUrl = privateConfirmationUrl(origin.privatePayload);
  const publicationStatus = origin.status === "PUBLICATION_PENDING"
    ? "PENDING" as const
    : ["PUBLISHED", "PROJECTION_PENDING"].includes(origin.status)
      ? "CONFIRMED" as const
      : undefined;
  return {
    receivableId: origin.receivableId,
    draftId: origin.id,
    privateStatus: privateState.receivable.status,
    originationStatus: origin.status,
    canonicalSource: origin.canonicalSource,
    title: privateState.version.paymentDescription,
    nominalUsdCents: privateState.version.nominalAmount.toString(),
    dueAt: privateState.version.dueAt.toISOString(),
    ...(candidate ? { candidate } : {}),
    ...(origin.publicEventId ? { publicEventId: origin.publicEventId } : {}),
    ...(publicationStatus ? { publicationStatus } : {}),
    ...(confirmationUrl ? { confirmationUrl } : {}),
    nextStep: nextStep({
      originationStatus: origin.status,
      privateStatus: privateState.receivable.status,
      poolStatus: pool?.status,
    }),
    ...(pool ? { pool: {
      poolId: pool.poolId,
      status: pool.status,
      ...(pool.publicEventId ? { publicEventId: pool.publicEventId } : {}),
      canonicalSource: pool.canonicalSource,
    } } : {}),
  };
}

export async function readLrpProductJourney<THKT extends PgQueryResultHKT>(
  db: Database<THKT>,
  input: { requesterId: string; mode: MigratingMode },
) {
  const origins = await db.select().from(lrpReceivableOriginations)
    .where(and(
      eq(lrpReceivableOriginations.requesterId, input.requesterId),
      eq(lrpReceivableOriginations.mode, input.mode),
    ))
    .orderBy(desc(lrpReceivableOriginations.createdAt));
  const history = (await Promise.all(origins.map((origin) => readOne(db, origin))))
    .filter((item): item is LrpProductReceivable => Boolean(item));
  const activeOriginIds = await db.select({ id: receivables.id }).from(receivables)
    .where(and(
      eq(receivables.requesterId, input.requesterId),
      notInArray(receivables.status, ["REJECTED", "CLOSED"]),
    ));
  const activeIds = new Set(activeOriginIds.map((item) => item.id));
  return {
    active: history.find((item) => activeIds.has(item.receivableId)),
    history,
  };
}
