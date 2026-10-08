import { randomUUID } from "node:crypto";

import { Connection, PublicKey } from "@solana/web3.js";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  adminReviews,
  auditEvents,
  clientConfirmations,
  clients,
  grpReceivableMarkets,
  markets,
  receivableVersions,
  receivables,
  users,
  validations,
} from "@/db/schema";
import { assertJsonPayloadSize, assertSameOrigin, enforceRateLimit } from "@/lib/api-security";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GRP_PROGRAM_ID = "CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY";

const headers = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};

const reviewSchema = z.object({
  receivableId: z.string().uuid(),
  decision: z.enum(["APPROVED", "NEEDS_INFORMATION", "REJECTED"]),
  reason: z.string().trim().min(10).max(500),
  signature: z.string().min(32).max(128).optional(),
  reconcile: z.boolean().optional().default(false),
}).strict();

function authorityWallet() {
  return process.env.NEXT_PUBLIC_GRP_ORIGINATOR_WALLET?.trim() ?? "";
}

function rpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
}

function programId() {
  return new PublicKey(
    process.env.NEXT_PUBLIC_GRP_PROGRAM_ID?.trim() || DEFAULT_GRP_PROGRAM_ID,
  );
}

function uuidBytes(value: string) {
  const hex = value.replaceAll("-", "");
  if (!/^[a-f0-9]{32}$/i.test(hex)) throw new Error("GRP_RECEIVABLE_ID_INVALID");
  return Buffer.from(hex, "hex");
}

function deriveValidationAccounts(input: {
  receivableId: string;
  requesterWallet: string;
  validatorWallet: string;
}) {
  const program = programId();
  const requester = new PublicKey(input.requesterWallet);
  const validator = new PublicKey(input.validatorWallet);
  const [receivable] = PublicKey.findProgramAddressSync(
    [Buffer.from("receivable"), requester.toBuffer(), uuidBytes(input.receivableId)],
    program,
  );
  const [payerAuthorization] = PublicKey.findProgramAddressSync(
    [Buffer.from("payer-authorization"), receivable.toBuffer()],
    program,
  );
  const [validation] = PublicKey.findProgramAddressSync(
    [Buffer.from("validation"), receivable.toBuffer(), validator.toBuffer()],
    program,
  );
  return { program, receivable, payerAuthorization, validation };
}

function validationDecision(accountData: Buffer | Uint8Array | undefined | null) {
  if (!accountData || accountData.length <= 72) return null;
  const value = accountData[72];
  if (value === 0) return "NEEDS_INFORMATION" as const;
  if (value === 1) return "APPROVED" as const;
  if (value === 2) return "REJECTED" as const;
  return null;
}

async function readOnchainValidation(
  connection: Connection,
  input: {
    receivableId: string;
    requesterWallet: string;
    validatorWallet: string;
  },
) {
  const pdas = deriveValidationAccounts(input);
  const [receivableInfo, payerAuthorizationInfo, validationInfo] =
    await connection.getMultipleAccountsInfo(
      [pdas.receivable, pdas.payerAuthorization, pdas.validation],
      "confirmed",
    );

  const validationOwnedByProgram = Boolean(
    validationInfo && validationInfo.owner.equals(pdas.program),
  );

  return {
    receivablePda: pdas.receivable.toBase58(),
    payerAuthorizationPda: pdas.payerAuthorization.toBase58(),
    validationPda: pdas.validation.toBase58(),
    receivableExists: Boolean(receivableInfo),
    payerAuthorizationExists: Boolean(payerAuthorizationInfo),
    validationExists: validationOwnedByProgram,
    validationDecision: validationOwnedByProgram
      ? validationDecision(validationInfo?.data)
      : null,
    readyForValidation: Boolean(receivableInfo && payerAuthorizationInfo && !validationInfo),
  };
}

async function waitForOnchainDecision(
  connection: Connection,
  input: {
    receivableId: string;
    requesterWallet: string;
    validatorWallet: string;
    expectedDecision: "APPROVED" | "NEEDS_INFORMATION" | "REJECTED";
  },
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const status = await readOnchainValidation(connection, input);
    if (
      status.validationExists &&
      status.validationDecision === input.expectedDecision
    ) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("GRP_VALIDATION_STATE_NOT_FOUND_ONCHAIN");
}

function assertGrpAdmin(profile: { solanaWallet?: string | null }) {
  const authority = authorityWallet();
  if (!authority || profile.solanaWallet !== authority) {
    throw new Error("GRP_ADMIN_REQUIRED");
  }
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "APP_SESSION_REQUIRED") return 401;
  if (message === "GRP_ADMIN_REQUIRED") return 403;
  if (message === "GRP_RECEIVABLE_NOT_REVIEWABLE") return 409;
  if (message === "GRP_VALIDATION_TX_NOT_CONFIRMED") return 409;
  if (message === "GRP_VALIDATION_STATE_NOT_FOUND_ONCHAIN") return 409;
  if (message === "GRP_VALIDATION_DECISION_MISMATCH") return 409;
  return 400;
}

export async function GET(request: Request) {
  try {
    return await withSessionProfile(request, async ({ profile, db }) => {
      assertGrpAdmin(profile);
      enforceRateLimit(`grp:admin:receivables:${profile.userId}`, 60);

      const rows = await db
        .select({
          id: receivables.id,
          status: receivables.status,
          requesterWallet: users.solanaWallet,
          nominalUsdCents: receivables.nominalAmount,
          dueAt: receivables.dueAt,
          evidenceHash: receivables.evidenceHash,
          description: receivableVersions.paymentDescription,
          purpose: receivableVersions.paymentPurpose,
          payerCountry: clients.countryCode,
          confirmationStatus: clientConfirmations.status,
          confirmationExpiresAt: clientConfirmations.expiresAt,
          createdAt: receivables.createdAt,
          marketName: markets.name,
          marketSlug: markets.slug,
        })
        .from(receivables)
        .innerJoin(users, eq(users.id, receivables.requesterId))
        .innerJoin(clients, eq(clients.id, receivables.clientId))
        .leftJoin(grpReceivableMarkets, eq(grpReceivableMarkets.receivableId, receivables.id))
        .leftJoin(markets, eq(markets.id, grpReceivableMarkets.marketId))
        .innerJoin(
          receivableVersions,
          and(
            eq(receivableVersions.receivableId, receivables.id),
            eq(receivableVersions.version, receivables.version),
          ),
        )
        .leftJoin(
          clientConfirmations,
          and(
            eq(clientConfirmations.receivableId, receivables.id),
            eq(clientConfirmations.receivableVersion, receivables.version),
          ),
        )
        .where(eq(receivables.status, "UNDER_VALIDATION"))
        .orderBy(desc(receivables.createdAt));

      const authority = authorityWallet();
      const connection = new Connection(rpcUrl(), "confirmed");
      const enriched = await Promise.all(
        rows.map(async (row) => {
          let onchain = {
            receivablePda: null as string | null,
            payerAuthorizationPda: null as string | null,
            validationPda: null as string | null,
            receivableExists: false,
            payerAuthorizationExists: false,
            validationExists: false,
            validationDecision: null as "APPROVED" | "NEEDS_INFORMATION" | "REJECTED" | null,
            readyForValidation: false,
          };

          if (row.requesterWallet && authority) {
            try {
              onchain = await readOnchainValidation(connection, {
                receivableId: row.id,
                requesterWallet: row.requesterWallet,
                validatorWallet: authority,
              });
            } catch {
              // Keep the row visible even if RPC is temporarily unavailable.
            }
          }

          return {
            id: row.id,
            status: row.status,
            requesterWallet: row.requesterWallet,
            nominalUsdCents: row.nominalUsdCents.toString(),
            dueAt: row.dueAt.toISOString(),
            evidenceHash: row.evidenceHash,
            description: row.description,
            purpose: row.purpose,
            payerCountry: row.payerCountry,
            confirmationStatus: row.confirmationStatus,
            confirmationExpiresAt: row.confirmationExpiresAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
            marketName: row.marketName,
            marketSlug: row.marketSlug,
            onchain,
          };
        }),
      );

      return NextResponse.json({ receivables: enriched }, { headers });
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GRP_ADMIN_READ_FAILED" },
      { status: statusFor(error), headers },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonPayloadSize(request);
    const body = reviewSchema.parse(await request.json());

    return await withSessionProfile(request, async ({ profile, db }) => {
      assertGrpAdmin(profile);
      enforceRateLimit(`grp:admin:review:${profile.userId}`, 20);

      const [current] = await db
        .select({
          receivable: receivables,
          requesterWallet: users.solanaWallet,
        })
        .from(receivables)
        .innerJoin(users, eq(users.id, receivables.requesterId))
        .where(eq(receivables.id, body.receivableId))
        .limit(1);

      if (!current || !current.requesterWallet) {
        throw new Error("GRP_RECEIVABLE_NOT_REVIEWABLE");
      }

      if (current.receivable.status !== "UNDER_VALIDATION") {
        const expected =
          body.decision === "APPROVED"
            ? "APPROVED"
            : body.decision === "REJECTED"
              ? "REJECTED"
              : "NEEDS_CORRECTION";
        if (current.receivable.status === expected) {
          return NextResponse.json(
            { receivableId: current.receivable.id, status: expected, alreadySynced: true },
            { headers },
          );
        }
        throw new Error("GRP_RECEIVABLE_NOT_REVIEWABLE");
      }

      const connection = new Connection(rpcUrl(), "confirmed");
      if (body.signature) {
        const signature = await connection.getSignatureStatus(body.signature, {
          searchTransactionHistory: true,
        });
        const signatureStatus = signature.value;
        if (
          !signatureStatus ||
          signatureStatus.err ||
          !["confirmed", "finalized"].includes(signatureStatus.confirmationStatus ?? "")
        ) {
          throw new Error("GRP_VALIDATION_TX_NOT_CONFIRMED");
        }
      } else if (!body.reconcile) {
        throw new Error("GRP_VALIDATION_TX_NOT_CONFIRMED");
      }

      const onchain = await waitForOnchainDecision(connection, {
        receivableId: body.receivableId,
        requesterWallet: current.requesterWallet,
        validatorWallet: authorityWallet(),
        expectedDecision: body.decision,
      });

      if (onchain.validationDecision !== body.decision) {
        throw new Error("GRP_VALIDATION_DECISION_MISMATCH");
      }

      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const [receivable] = await tx
          .select()
          .from(receivables)
          .where(eq(receivables.id, body.receivableId))
          .for("update");

        if (!receivable) {
          throw new Error("GRP_RECEIVABLE_NOT_REVIEWABLE");
        }

        if (receivable.status !== "UNDER_VALIDATION") {
          return { receivableId: receivable.id, status: receivable.status, alreadySynced: true };
        }

        const validationId = randomUUID();
        const validationStatus =
          body.decision === "APPROVED"
            ? "PASSED"
            : body.decision === "REJECTED"
              ? "FAILED"
              : "NEEDS_REVIEW";
        const nextReceivableStatus =
          body.decision === "APPROVED"
            ? "APPROVED"
            : body.decision === "REJECTED"
              ? "REJECTED"
              : "NEEDS_CORRECTION";

        await tx.insert(validations).values({
          id: validationId,
          receivableId: receivable.id,
          receivableVersion: receivable.version,
          status: validationStatus,
          rulesVersion: "grp-validation-v1",
          results: {
            source: body.reconcile ? "GRP_ADMIN_RECONCILIATION" : "GRP_ADMIN",
            solanaSignature: body.signature ?? null,
            validationPda: onchain.validationPda,
            decision: body.decision,
          },
          decisionReason: body.reason,
          reviewedBy: profile.userId,
          updatedAt: now,
        });

        if (body.decision !== "NEEDS_INFORMATION") {
          await tx.insert(adminReviews).values({
            id: randomUUID(),
            validationId,
            reviewerId: profile.userId,
            decision: body.decision === "APPROVED" ? "PASSED" : "FAILED",
            reason: body.reason,
            correlationId: randomUUID(),
          });
        }

        await tx
          .update(receivables)
          .set({ status: nextReceivableStatus, updatedAt: now })
          .where(eq(receivables.id, receivable.id));

        await tx.insert(auditEvents).values({
          id: randomUUID(),
          actorId: profile.userId,
          action: body.reconcile
            ? "GRP_RECEIVABLE_VALIDATION_RECONCILED"
            : "GRP_RECEIVABLE_REVIEWED",
          targetType: "RECEIVABLE",
          targetId: receivable.id,
          correlationId: randomUUID(),
          after: {
            decision: body.decision,
            reason: body.reason,
            solanaSignature: body.signature ?? null,
            validationPda: onchain.validationPda,
          },
        });

        return { receivableId: receivable.id, status: nextReceivableStatus, alreadySynced: false };
      });

      return NextResponse.json(result, { headers });
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "GRP_ADMIN_REVIEW_INVALID"
        : error instanceof Error
          ? error.message
          : "GRP_ADMIN_REVIEW_FAILED";
    return NextResponse.json({ error: message }, { status: statusFor(error), headers });
  }
}
