import { Connection, PublicKey } from "@solana/web3.js";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  grpReceivableMarkets,
  markets,
  receivableVersions,
  receivables,
} from "@/db/schema";
import { withSessionProfile } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GRP_PROGRAM_ID = "CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY";

function rpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
}

function programId() {
  return new PublicKey(
    process.env.NEXT_PUBLIC_GRP_PROGRAM_ID?.trim() || DEFAULT_GRP_PROGRAM_ID,
  );
}

function readU64(data: Buffer, offset: number) {
  return data.readBigUInt64LE(offset);
}

function readI64(data: Buffer, offset: number) {
  return data.readBigInt64LE(offset);
}

export async function GET(request: Request) {
  try {
    return await withSessionProfile(request, async ({ profile, db }) => {
      if (!profile.solanaWallet) throw new Error("SOLANA_WALLET_REQUIRED");

      const subject = new PublicKey(profile.solanaWallet);
      const program = programId();
      const [passportPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("passport"), subject.toBuffer()],
        program,
      );

      const connection = new Connection(rpcUrl(), "confirmed");
      const account = await connection.getAccountInfo(passportPda, "confirmed");

      const rows = await db
        .select({
          id: receivables.id,
          status: receivables.status,
          nominalUsdCents: receivables.nominalAmount,
          dueAt: receivables.dueAt,
          createdAt: receivables.createdAt,
          updatedAt: receivables.updatedAt,
          description: receivableVersions.paymentDescription,
          marketName: markets.name,
          marketSlug: markets.slug,
        })
        .from(receivables)
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
        .where(eq(receivables.requesterId, profile.userId))
        .orderBy(desc(receivables.updatedAt))
        .limit(20);

      if (!account || !account.owner.equals(program) || account.data.length < 105) {
        return NextResponse.json({
          passport: null,
          passportPda: passportPda.toBase58(),
          subject: subject.toBase58(),
          network: "Solana Devnet",
          history: rows.map((row) => ({
            id: row.id,
            description: row.description,
            status: row.status,
            nominalUsdCents: row.nominalUsdCents.toString(),
            dueAt: row.dueAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            marketName: row.marketName,
            marketSlug: row.marketSlug,
          })),
        });
      }

      const data = account.data;
      const receivablesCreated = readU64(data, 40);
      const receivablesSettled = readU64(data, 48);
      const settledOnTime = readU64(data, 56);
      const settledLate = readU64(data, 64);
      const defaults = readU64(data, 72);
      const defaultsCured = readU64(data, 80);
      const totalSettledAmountUsdcMinor = readU64(data, 88);
      const lastUpdatedAtUnix = readI64(data, 96);

      const completed = settledOnTime + settledLate;
      const onTimeRateBps =
        completed > 0n ? Number((settledOnTime * 10_000n) / completed) : null;

      return NextResponse.json({
        passport: {
          receivablesCreated: receivablesCreated.toString(),
          receivablesSettled: receivablesSettled.toString(),
          settledOnTime: settledOnTime.toString(),
          settledLate: settledLate.toString(),
          defaults: defaults.toString(),
          defaultsCured: defaultsCured.toString(),
          totalSettledAmountUsdcMinor: totalSettledAmountUsdcMinor.toString(),
          onTimeRateBps,
          lastUpdatedAt:
            lastUpdatedAtUnix > 0n
              ? new Date(Number(lastUpdatedAtUnix) * 1000).toISOString()
              : null,
        },
        passportPda: passportPda.toBase58(),
        subject: subject.toBase58(),
        network: "Solana Devnet",
        history: rows.map((row) => ({
          id: row.id,
          description: row.description,
          status: row.status,
          nominalUsdCents: row.nominalUsdCents.toString(),
          dueAt: row.dueAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          marketName: row.marketName,
          marketSlug: row.marketSlug,
        })),
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GRP_PASSPORT_READ_FAILED";
    return NextResponse.json(
      { error: message },
      { status: message === "APP_SESSION_REQUIRED" ? 401 : 400 },
    );
  }
}
