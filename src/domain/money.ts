import { DomainError } from "./errors";

export const assets = ["BTC", "USD_REFERENCE", "USDT"] as const;

export type Asset = (typeof assets)[number];

export type Money = Readonly<{
  amount: bigint;
  asset: Asset;
}>;

export function money(amount: bigint, asset: Asset): Money {
  return Object.freeze({ amount, asset });
}

export function positiveMoney(amount: bigint, asset: Asset): Money {
  if (amount <= 0n) {
    throw new DomainError("O valor precisa ser maior que zero.", "INVALID_AMOUNT");
  }

  return money(amount, asset);
}

export function addMoney(left: Money, right: Money): Money {
  assertSameAsset(left, right);
  return money(left.amount + right.amount, left.asset);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameAsset(left, right);
  return money(left.amount - right.amount, left.asset);
}

export function assertSameAsset(left: Money, right: Money): void {
  if (left.asset !== right.asset) {
    throw new DomainError(
      `Não é possível combinar ${left.asset} com ${right.asset}.`,
      "ASSET_MISMATCH",
    );
  }
}
