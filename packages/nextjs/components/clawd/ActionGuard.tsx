"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

/**
 * Four-state flow: one primary CTA at a time in the SAME slot.
 *   1. not connected  -> Connect Wallet button
 *   2. wrong network  -> Switch to Base button
 *   3+4. children (Approve / Action — caller sequences those two)
 */
export const ActionGuard = ({ children }: { children: React.ReactNode }) => {
  const { isConnected, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  if (!isConnected) {
    return <RainbowKitCustomConnectButton />;
  }

  if (chain?.id !== targetNetwork.id) {
    return (
      <button
        className="btn btn-primary"
        disabled={isSwitching}
        onClick={() => switchChain({ chainId: targetNetwork.id })}
      >
        {isSwitching && <span className="loading loading-spinner loading-sm mr-2" />}
        {isSwitching ? "Switching..." : `Switch to ${targetNetwork.name}`}
      </button>
    );
  }

  return <>{children}</>;
};
