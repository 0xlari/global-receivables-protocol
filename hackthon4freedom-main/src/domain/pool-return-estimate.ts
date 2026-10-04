export type ReturnEstimate = Readonly<{
  centralSats: number;
  btcUpTenPercentSats: number;
  btcDownTenPercentSats: number;
  estimatedProfitSats: number;
}>;

export function estimatePoolReturnSats(contributionSats: number, discountBps: number): ReturnEstimate {
  if (!Number.isSafeInteger(contributionSats) || contributionSats <= 0) {
    throw new Error("Aporte precisa ser um inteiro positivo em sats.");
  }
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 500) {
    throw new Error("Desconto precisa estar entre 0 e 5%.");
  }

  const estimatedProfitSats = Math.floor(
    (contributionSats * discountBps * 7_000) / ((10_000 - discountBps) * 10_000),
  );
  const centralSats = contributionSats + estimatedProfitSats;

  return Object.freeze({
    centralSats,
    estimatedProfitSats,
    btcUpTenPercentSats: Math.floor((centralSats * 10_000) / 11_000),
    btcDownTenPercentSats: Math.floor((centralSats * 10_000) / 9_000),
  });
}
