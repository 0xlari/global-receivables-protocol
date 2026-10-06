import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseFromEnvironment } from "@/db/client";
import {
  confirmReceivable,
  inspectGrpClientConfirmation,
} from "@/db/repositories/receivable-repository";
import { DomainError } from "@/domain/errors";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), token: z.string().min(1).max(128) }),
  z.object({
    action: z.literal("respond"),
    token: z.string().min(1).max(128),
    acceptsUsdc: z.boolean(),
    confirmsDescription: z.boolean(),
    amountUsd: z.string().regex(/^\d{1,9}([.,]\d{1,2})?$/),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    termsVersion: z.string().max(80),
  }),
]);

function usdToCents(value: string) {
  const [whole, decimal = ""] = value.replace(",", ".").split(".");
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
}

const privateHeaders = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};

export async function POST(request: Request) {
  let bundle: ReturnType<typeof databaseFromEnvironment> | undefined;
  try {
    const body = requestSchema.parse(await request.json());
    bundle = databaseFromEnvironment();
    const now = new Date();

    if (body.action === "inspect") {
      const details = await inspectGrpClientConfirmation(bundle.db, body.token, now);
      return NextResponse.json(
        {
          paymentDescription: details.paymentDescription,
          paymentPurpose: details.paymentPurpose,
          nominalUsdCents: details.nominalUsdCents.toString(),
          dueAt: details.dueAt.toISOString(),
          termsVersion: details.termsVersion,
          receivableId: details.receivableId,
          requesterSolanaWallet: details.requesterSolanaWallet,
          grpUsdcMint: process.env.NEXT_PUBLIC_GRP_USDC_MINT ?? null,
          confirmationStatus: details.confirmationStatus,
          confirmationExpiresAt: details.confirmationExpiresAt.toISOString(),
        },
        { headers: privateHeaders },
      );
    }

    const result = await confirmReceivable(bundle.db, {
      rawToken: body.token,
      // Temporary compatibility with the legacy DB column name.
      acceptsBtc: body.acceptsUsdc,
      confirmsDescription: body.confirmsDescription,
      confirmedAmountUsdCents: usdToCents(body.amountUsd),
      confirmedDueAt: new Date(`${body.dueDate}T12:00:00.000Z`),
      termsVersion: body.termsVersion,
      now,
    });

    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400, headers: privateHeaders },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados de confirmação inválidos.", code: "INVALID_CONFIRMATION_REQUEST" },
        { status: 400, headers: privateHeaders },
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.error("GRP payer confirmation failed", error);
    }
    return NextResponse.json(
      { error: "Serviço temporariamente indisponível.", code: "GRP_CONFIRMATION_UNAVAILABLE" },
      { status: 500, headers: privateHeaders },
    );
  } finally {
    await bundle?.close();
  }
}
