import { DomainError } from "./errors";
import type { Asset } from "./money";

export type LedgerPosting = Readonly<{
  accountId: string;
  amount: bigint;
  asset: Asset;
}>;

export type LedgerTransaction = Readonly<{
  id: string;
  idempotencyKey: string;
  description: string;
  postings: readonly LedgerPosting[];
}>;

export function createLedgerTransaction(
  input: LedgerTransaction,
): LedgerTransaction {
  if (input.idempotencyKey.trim().length === 0) {
    throw new DomainError(
      "A chave idempotente é obrigatória.",
      "MISSING_IDEMPOTENCY_KEY",
    );
  }

  if (input.postings.length < 2) {
    throw new DomainError(
      "Uma transação precisa de pelo menos duas partidas.",
      "INSUFFICIENT_POSTINGS",
    );
  }

  const balances = new Map<Asset, bigint>();

  for (const posting of input.postings) {
    if (posting.amount === 0n) {
      throw new DomainError(
        "Partidas com valor zero não são permitidas.",
        "ZERO_POSTING",
      );
    }

    balances.set(
      posting.asset,
      (balances.get(posting.asset) ?? 0n) + posting.amount,
    );
  }

  for (const [asset, balance] of balances) {
    if (balance !== 0n) {
      throw new DomainError(
        `O ledger está desequilibrado em ${asset}: ${balance}.`,
        "UNBALANCED_LEDGER",
      );
    }
  }

  return Object.freeze({
    ...input,
    postings: Object.freeze([...input.postings]),
  });
}
