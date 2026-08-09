"use client";

import { useEffect, useState } from "react";

const CLAWD_ADDRESS = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";

/**
 * USD price of $CLAWD from DexScreener (canonical Uniswap V4 CLAWD/WETH pool on
 * Base). Client-side, refreshed every 60s. Returns 0 until loaded / on failure —
 * callers should degrade to token-only display.
 */
export const useClawdPrice = () => {
  const [price, setPrice] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CLAWD_ADDRESS}`);
        if (!res.ok) return;
        const data = await res.json();
        const pairs: { priceUsd?: string; liquidity?: { usd?: number } }[] = data?.pairs || [];
        // highest-liquidity pair wins
        const best = pairs.filter(p => p.priceUsd).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
        if (!cancelled && best?.priceUsd) setPrice(Number(best.priceUsd));
      } catch {
        // degrade silently — UI shows token amounts without USD
      }
    };
    fetchPrice();
    const id = setInterval(fetchPrice, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return price;
};
