import { Connection, PublicKey } from "@solana/web3.js";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  grpReceivableMarkets,
  markets,
  receivableVersions,
  receivables,
  users,
} from "@/db/schema";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GRP_PROGRAM_ID = "CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY";

function programId() {
  return new PublicKey(
    process.env.NEXT_PUBLIC_GRP_PROGRAM_ID?.trim() || DEFAULT_GRP_PROGRAM_ID,
  );
}

function rpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
}

function uuidBytes(value: string) {
  const hex = value.replaceAll("-", "");
  if (!/^[a-f0-9]{32}$/i.test(hex)) throw new Error("GRP_RECEIVABLE_ID_INVALID");
  return Buffer.from(hex, "hex");
}

function derivePool(requester: PublicKey, receivableId: string) {
  const program = programId();
  const [receivable] = PublicKey.findProgramAddressSync(
    [Buffer.from("receivable"), requester.toBuffer(), uuidBytes(receivableId)],
    program,
  );
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), receivable.toBuffer()],
    program,
  );
  return { program, pool };
}

function readU64(data: Buffer, offset: number) {
  return data.readBigUInt64LE(offset).toString();
}

function readI64(data: Buffer, offset: number) {
  return data.readBigInt64LE(offset).toString();
}

const poolStatus = [
  "OPEN",
  "FULL",
  "PARTIAL_EXPIRED",
  "ACCEPTED_PARTIAL",
  "REFUNDING",
  "FUNDED",
  "SETTLING",
  "SETTLED",
  "CURED",
  "DEFAULTED",
  "DISPUTED",
  "CANCELLED",
];

export async function GET(request: Request) {
  try {
    return await withSessionProfile(request, async ({ profile, db }) => {
      const rows = await db
        .select({
          receivableId: receivables.id,
          description: receivableVersions.paymentDescription,
          nominalUsdCents: receivables.nominalAmount,
          dueAt: receivables.dueAt,
          requesterWallet: users.solanaWallet,
          marketName: markets.name,
          marketSlug: markets.slug,
          createdAt: receivables.createdAt,
        })
        .from(receivables)
        .innerJoin(users, eq(users.id, receivables.requesterId))
        .innerJoin(
          receivableVersions,
          and(
            eq(receivableVersions.receivableId, receivables.id),
            eq(receivableVersions.version, receivables.version),
          ),
        )
        .leftJoin(
          grpReceivableMarkets,
          eq(grpReceivableMarkets.receivableId, receivables.id),
        )
        .leftJoin(markets, eq(markets.id, grpReceivableMarkets.marketId))
        .where(
          and(
            inArray(receivables.status, ["POOLED", "ADVANCED", "DUE", "PAID", "DEFAULTED"]),
            eq(markets.slug, "elas-recebem-hoje"),
          ),
        )
        .orderBy(desc(receivables.createdAt));

      const connection = new Connection(rpcUrl(), "confirmed");
      const opportunities = await Promise.all(
        rows.map(async (row) => {
          if (!row.requesterWallet) return null;
          const derived = derivePool(
            new PublicKey(row.requesterWallet),
            row.receivableId,
          );
          const account = await connection.getAccountInfo(derived.pool, "confirmed");
          if (!account || !account.owner.equals(derived.program) || account.data.length < 189) {
            return null;
          }

          let contribution = null as null | {
            pda: string;
            amountUsdcMinor: string;
            distributedAmountUsdcMinor: string;
            status: number;
          };

          if (profile.solanaWallet) {
            const investor = new PublicKey(profile.solanaWallet);
            const [contributionPda] = PublicKey.findProgramAddressSync(
              [Buffer.from("contribution"), derived.pool.toBuffer(), investor.toBuffer()],
              derived.program,
            );
            const contributionInfo = await connection.getAccountInfo(
              contributionPda,
              "confirmed",
            );
            if (
              contributionInfo &&
              contributionInfo.owner.equals(derived.program) &&
              contributionInfo.data.length >= 97
            ) {
              contribution = {
                pda: contributionPda.toBase58(),
                amountUsdcMinor: contributionInfo.data.readBigUInt64LE(72).toString(),
                distributedAmountUsdcMinor: contributionInfo.data.readBigUInt64LE(80).toString(),
                status: contributionInfo.data[96] ?? 0,
              };
            }
          }

          return {
            receivableId: row.receivableId,
            description: row.description,
            nominalUsdCents: row.nominalUsdCents.toString(),
            dueAt: row.dueAt.toISOString(),
            marketName: row.marketName,
            requesterWallet: row.requesterWallet,
            isRequester: profile.solanaWallet === row.requesterWallet,
            poolPda: derived.pool.toBase58(),
            targetAmountUsdcMinor: readU64(account.data, 136),
            fundedAmountUsdcMinor: readU64(account.data, 144),
            minimumPartialBps: account.data.readUInt16LE(168),
            discountBps: account.data.readUInt16LE(170),
            fundingDeadlineUnix: readI64(account.data, 172),
            status: poolStatus[account.data[188] ?? 0] ?? "UNKNOWN",
            contribution,
          };
        }),
      );

      return NextResponse.json({
        opportunities: opportunities.filter(Boolean),
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GRP_POOLS_READ_FAILED";
    return NextResponse.json(
      { error: message },
      { status: message === "APP_SESSION_REQUIRED" ? 401 : 400 },
    );
  }
}
