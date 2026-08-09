"use client";

import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { zeroAddress } from "viem";
import { useAccount } from "wagmi";
import { OwnerPanel } from "~~/components/clawd/OwnerPanel";
import { TermCard } from "~~/components/clawd/TermCard";
import externalContracts from "~~/contracts/externalContracts";
import { useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { useClawdPrice } from "~~/hooks/useClawdPrice";

const CLAWD_INTERN_ADDRESS = externalContracts[8453].ClawdIntern.address;
const CLAWD_ADDRESS = externalContracts[8453].CLAWD.address;

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const clawdPrice = useClawdPrice();

  const { data: current } = useScaffoldReadContract({
    contractName: "ClawdIntern",
    functionName: "currentIntern",
    watch: true,
  });
  const { data: termCount } = useScaffoldReadContract({
    contractName: "ClawdIntern",
    functionName: "termCount",
    watch: true,
  });
  const { data: owner } = useScaffoldReadContract({
    contractName: "ClawdIntern",
    functionName: "owner",
  });

  const [currentInternAddr, currentTermId] = current ?? [zeroAddress, 0n, 0];
  const hasActiveTerm = currentInternAddr !== zeroAddress;
  const isOwner = !!connectedAddress && !!owner && connectedAddress.toLowerCase() === owner.toLowerCase();

  const count = termCount !== undefined ? Number(termCount) : 0;
  const historyIds = Array.from({ length: count }, (_, i) => BigInt(count - 1 - i)).filter(
    id => !(hasActiveTerm && id === currentTermId),
  );

  return (
    <div className="flex items-center flex-col grow pt-10 pb-16 px-4">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-1">🦞 Clawd Intern</h1>
          <p className="text-lg opacity-80 m-0">
            A rotating growth-intern seat, paid in <span className="font-semibold">$CLAWD</span> for price gains —
            onchain stock options with a 30-day vesting stream.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-x-6 gap-y-1 mt-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="opacity-70">Contract:</span>
              <Address address={CLAWD_INTERN_ADDRESS} chain={targetNetwork} />
            </div>
            <div className="flex items-center gap-2">
              <span className="opacity-70">$CLAWD:</span>
              <Address address={CLAWD_ADDRESS} chain={targetNetwork} />
              {clawdPrice > 0 && (
                <span className="badge badge-ghost font-mono">
                  ${clawdPrice.toLocaleString(undefined, { maximumSignificantDigits: 3 })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Current intern</h2>
          {current === undefined ? (
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body items-center">
                <span className="loading loading-spinner loading-md" />
              </div>
            </div>
          ) : hasActiveTerm ? (
            <TermCard termId={currentTermId} isActive clawdPrice={clawdPrice} />
          ) : (
            <div className="card bg-base-100 border border-dashed border-base-300">
              <div className="card-body items-center text-center">
                <p className="m-0 text-lg">The seat is empty — no active term.</p>
                <p className="m-0 text-sm opacity-70">
                  The owner opens a term by locking a CLAWD budget against a mark-in price. If the price is up at close,
                  the intern earns a proportional share, streamed over 30 days.
                </p>
              </div>
            </div>
          )}
        </div>

        {isOwner && (
          <OwnerPanel
            activeTermId={hasActiveTerm ? currentTermId : undefined}
            clawdPrice={clawdPrice}
            clawdInternAddress={CLAWD_INTERN_ADDRESS}
          />
        )}

        {historyIds.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Past terms</h2>
            <div className="flex flex-col gap-3">
              {historyIds.map(id => (
                <TermCard key={id.toString()} termId={id} isActive={false} clawdPrice={clawdPrice} />
              ))}
            </div>
          </div>
        )}

        <div className="card bg-base-200">
          <div className="card-body py-4 text-sm opacity-80">
            <h3 className="font-semibold m-0 text-base-content">How it works</h3>
            <ul className="list-disc list-inside m-0 flex flex-col gap-1">
              <li>The owner appoints an intern and locks a CLAWD budget with a mark-in USD price.</li>
              <li>
                At term end the owner closes with a mark-out price. Gains up to +50% earn a proportional share of the
                budget; +50% earns it all. No gain, no payout.
              </li>
              <li>
                The payout streams linearly over 30 days — anyone can trigger claims, tokens only go to the intern.
              </li>
              <li>
                Phase 0 trust model: marks are owner-provided (no oracle to flash-loan). Every mark, cancel and slash is
                a public onchain event.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
