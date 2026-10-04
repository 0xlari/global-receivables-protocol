import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import { protocolNwcAuthorizations } from "@/db/schema";
import { encryptNwcSecret } from "@/integrations/nwc/secret-crypto";
import type { NwcGateway } from "@/integrations/nwc/types";
import { fingerprintNwcConnection, parseNwcUri } from "@/integrations/nwc/uri";
import { publicNwcFingerprint } from "@/integrations/nwc/public-fingerprint";

type Database<THKT extends PgQueryResultHKT> = PgDatabase<THKT, typeof schema>;

export async function prepareProtocolNwcAuthorization<THKT extends PgQueryResultHKT>(db: Database<THKT>, gateway: NwcGateway, input: {
  receivableEventId: string;
  clientPubkey: string;
  nwcUri: string;
  maxAmountMsat: bigint;
  dueAt: Date;
  expiresAt: Date;
  now: Date;
}) {
  if (input.maxAmountMsat <= 0n) throw new Error("INVALID_NWC_LIMIT");
  if (input.dueAt <= input.now || input.expiresAt <= input.dueAt) throw new Error("INVALID_NWC_DATES");
  const connection = parseNwcUri(input.nwcUri);
  const info = await gateway.getInfo(connection);
  if (!info.methods.includes("pay_invoice")) throw new Error("NWC_PAY_INVOICE_UNSUPPORTED");
  const safeFingerprint = publicNwcFingerprint(fingerprintNwcConnection(connection));
  const encryptedConnectionUri = encryptNwcSecret(input.nwcUri.trim());
  const [stored] = await db.insert(protocolNwcAuthorizations).values({
    id: randomUUID(), receivableEventId: input.receivableEventId, clientPubkey: input.clientPubkey,
    walletServicePubkey: connection.walletServicePubkey, encryptedConnectionUri, safeFingerprint,
    maxAmountMsat: input.maxAmountMsat, dueAt: input.dueAt, expiresAt: input.expiresAt,
    lastValidatedAt: input.now,
  }).onConflictDoUpdate({
    target: [protocolNwcAuthorizations.receivableEventId, protocolNwcAuthorizations.clientPubkey],
    set: { walletServicePubkey: connection.walletServicePubkey, encryptedConnectionUri, safeFingerprint,
      maxAmountMsat: input.maxAmountMsat, dueAt: input.dueAt, expiresAt: input.expiresAt,
      lastValidatedAt: input.now, attestationEventId: null, updatedAt: input.now },
  }).returning();
  if (!stored) throw new Error("NWC_PRIVATE_STORAGE_FAILED");
  return { authorizationState: "ACTIVE" as const, payInvoiceSupported: true, safeFingerprint,
    maxAmountMsat: stored.maxAmountMsat.toString(), dueAt: stored.dueAt, expiresAt: stored.expiresAt,
    lastValidatedAt: stored.lastValidatedAt, executorPubkey: input.clientPubkey };
}

export async function recordProtocolNwcAttestation<THKT extends PgQueryResultHKT>(db: Database<THKT>, input: {
  receivableEventId: string; clientPubkey: string; attestationEventId: string;
}) {
  const [updated] = await db.update(protocolNwcAuthorizations).set({ attestationEventId: input.attestationEventId, updatedAt: new Date() })
    .where(and(eq(protocolNwcAuthorizations.receivableEventId, input.receivableEventId), eq(protocolNwcAuthorizations.clientPubkey, input.clientPubkey)))
    .returning({ id: protocolNwcAuthorizations.id });
  if (!updated) throw new Error("NWC_PRIVATE_AUTHORIZATION_NOT_FOUND");
  return { recorded: true as const };
}
