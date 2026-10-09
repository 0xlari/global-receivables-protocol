export const ERH_MARKET_RULES = {
  advanceBps: 8_000,
  minimumPartialBps: 5_000,
  discountBps: 350,
  marketFeeBps: 100,
  protocolFeeBps: 50,
} as const;

export function calculateErhTargetUsdcMinor(nominalUsdCents: bigint) {
  const nominalUsdcMinor = nominalUsdCents * 10_000n;
  return (nominalUsdcMinor * BigInt(ERH_MARKET_RULES.advanceBps)) / 10_000n;
}

export function calculateErhTargetUsd(nominalUsdCents: string) {
  const cents = BigInt(nominalUsdCents);
  const targetCents = (cents * BigInt(ERH_MARKET_RULES.advanceBps)) / 10_000n;
  return (Number(targetCents) / 100).toFixed(2);
}
