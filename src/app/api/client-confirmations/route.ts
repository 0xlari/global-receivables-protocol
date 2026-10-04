import { NextResponse } from "next/server";
import { z } from "zod";

import { currentLrpModePolicy } from "@/config/lrp-mode";
import { databaseFromEnvironment } from "@/db/client";
import {
  confirmReceivable,
  inspectClientConfirmation,
} from "@/db/repositories/receivable-repository";
import { DomainError } from "@/domain/errors";
import { preparePayerCommitmentProof } from "@/services/lrp-payer-confirmation-service";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), token: z.string().min(1).max(128) }),
  z.object({
    action: z.literal("respond"),
    token: z.string().min(1).max(128),
    acceptsBtc: z.boolean(),
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
      const details = await inspectClientConfirmation(bundle.db, body.token, now);
      return NextResponse.json(
        {
          paymentDescription: details.paymentDescription,
          paymentPurpose: details.paymentPurpose,
          nominalUsdCents: details.nominalUsdCents.toString(),
          dueAt: details.dueAt.toISOString(),
          termsVersion: details.termsVersion,
        },
        { headers: privateHeaders },
      );
    }

    const result = await confirmReceivable(bundle.db, {
      rawToken: body.token,
      acceptsBtc: body.acceptsBtc,
      confirmsDescription: body.confirmsDescription,
      confirmedAmountUsdCents: usdToCents(body.amountUsd),
      confirmedDueAt: new Date(`${body.dueDate}T12:00:00.000Z`),
      termsVersion: body.termsVersion,
      now,
    });
    const policy = currentLrpModePolicy();
    if (policy.mode === "LEGACY" || result.outcome !== "ACCEPTED") {
      return NextResponse.json(result, { headers: privateHeaders });
    }
    const prepared = await preparePayerCommitmentProof(bundle.db, {
      receivableId: result.receivableId,
      mode: policy.mode,
      originatorPubkey: process.env.LRP_ORIGINATOR_PUBKEY?.trim().toLowerCase() || undefined,
      now,
    });
    return NextResponse.json({
      ...result,
      lrp: { status: prepared.status, signatureRequired: prepared.status === "CANDIDATE_READY" },
    }, { headers: privateHeaders });
  } catch (error) {
    const status = error instanceof DomainError ? 400 : error instanceof z.ZodError ? 400 : 500;
    const message =
      error instanceof DomainError || error instanceof z.ZodError
        ? "Não foi possível confirmar com este link. Confira os dados ou solicite um novo link."
        : "Serviço temporariamente indisponível.";
    return NextResponse.json({ error: message }, { status, headers: privateHeaders });
  } finally {
    await bundle?.close();
  }
}
