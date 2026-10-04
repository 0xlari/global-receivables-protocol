import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import {
  ledgerEntries,
  ledgerTransactions,
} from "@/db/schema";
import {
  createLedgerTransaction,
  type LedgerTransaction,
} from "@/domain/ledger";

export type RecordLedgerResult = Readonly<{
  transactionId: string;
  duplicate: boolean;
}>;

export async function recordLedgerTransaction<THKT extends PgQueryResultHKT>(
  db: PgDatabase<THKT, typeof schema>,
  input: LedgerTransaction & { correlationId: string },
): Promise<RecordLedgerResult> {
  const transaction = createLedgerTransaction(input);

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(ledgerTransactions)
      .values({
        id: transaction.id,
        idempotencyKey: transaction.idempotencyKey,
        description: transaction.description,
        correlationId: input.correlationId,
        status: "PENDING",
      })
      .onConflictDoNothing({ target: ledgerTransactions.idempotencyKey })
      .returning({ id: ledgerTransactions.id });

    if (!inserted) {
      const [existing] = await tx
        .select({ id: ledgerTransactions.id })
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.idempotencyKey, transaction.idempotencyKey))
        .limit(1);

      if (!existing) {
        throw new Error("Falha ao recuperar transação idempotente existente.");
      }

      return { transactionId: existing.id, duplicate: true };
    }

    await tx.insert(ledgerEntries).values(
      transaction.postings.map((posting) => ({
        id: randomUUID(),
        transactionId: transaction.id,
        accountId: posting.accountId,
        asset: posting.asset,
        amount: posting.amount,
      })),
    );

    await tx
      .update(ledgerTransactions)
      .set({ status: "POSTED", postedAt: new Date() })
      .where(eq(ledgerTransactions.id, transaction.id));

    return { transactionId: transaction.id, duplicate: false };
  });
}
