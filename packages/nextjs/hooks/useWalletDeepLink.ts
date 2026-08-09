"use client";

import { useCallback } from "react";
import { useAccount } from "wagmi";

/**
 * Mobile WalletConnect deep-linking. RainbowKit/WC v2 does NOT auto-open the
 * wallet app on mobile — it relies on push notifications. So: fire the tx
 * FIRST (gas estimation + WC relay), then switch the user to their wallet app
 * after a delay. Skipped on desktop and inside wallet in-app browsers
 * (window.ethereum present).
 */
export const useWalletDeepLink = () => {
  const { connector } = useAccount();

  const openWallet = useCallback(() => {
    if (typeof window === "undefined") return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile || (window as any).ethereum) return; // desktop or in-app browser

    // connector.id says "walletConnect", not which wallet — check wagmi storage
    // and the WC session blob too.
    const allIds = [connector?.id, connector?.name, localStorage.getItem("wagmi.recentConnectorId")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let wcWallet = "";
    try {
      const wcKey = Object.keys(localStorage).find(k => k.startsWith("wc@2:client"));
      if (wcKey) wcWallet = (localStorage.getItem(wcKey) || "").toLowerCase();
    } catch {
      // localStorage unavailable — skip deep link
    }
    const search = `${allIds} ${wcWallet}`;

    const schemes: [string[], string][] = [
      [["rainbow"], "rainbow://"],
      [["metamask"], "metamask://"],
      [["coinbase", "cbwallet"], "cbwallet://"],
      [["trust"], "trust://"],
      [["phantom"], "phantom://"],
    ];

    for (const [keywords, scheme] of schemes) {
      if (keywords.some(k => search.includes(k))) {
        window.location.href = scheme;
        return;
      }
    }
  }, [connector]);

  /** Fire the write first, deep link 2s later (WC relay needs the head start). */
  const writeAndOpen = useCallback(
    <T>(writeFn: () => Promise<T>): Promise<T> => {
      const promise = writeFn();
      setTimeout(openWallet, 2000);
      return promise;
    },
    [openWallet],
  );

  return { writeAndOpen };
};
