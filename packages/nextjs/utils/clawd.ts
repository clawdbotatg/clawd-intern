import { formatEther } from "viem";

/** "1,234,567 CLAWD (~$83.21)" — USD part omitted while price is unknown. */
export const formatClawd = (wei: bigint, priceUsd: number) => {
  const tokens = Number(formatEther(wei));
  const tokenStr = tokens.toLocaleString(undefined, { maximumFractionDigits: tokens < 1000 ? 2 : 0 });
  if (priceUsd > 0) {
    const usd = tokens * priceUsd;
    const usdStr = usd.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: usd < 1 ? 4 : 2,
    });
    return `${tokenStr} CLAWD (~${usdStr})`;
  }
  return `${tokenStr} CLAWD`;
};

/** Owner marks are USD * 1e18 — tiny numbers, show significant digits. */
export const formatMark = (mark: bigint) => {
  const usd = Number(formatEther(mark));
  if (usd === 0) return "$0";
  return `$${usd.toLocaleString(undefined, { maximumSignificantDigits: 4 })}`;
};

export const formatDuration = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
