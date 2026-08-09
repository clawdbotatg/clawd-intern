"use client";

import { useState } from "react";
import { ActionGuard } from "./ActionGuard";
import { Address } from "@scaffold-ui/components";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { formatClawd, formatDuration, formatMark } from "~~/utils/clawd";
import { notification } from "~~/utils/scaffold-eth";

const nowSec = () => Math.floor(Date.now() / 1000);

export const TermCard = ({
  termId,
  isActive,
  clawdPrice,
}: {
  termId: bigint;
  isActive: boolean;
  clawdPrice: number;
}) => {
  const { targetNetwork } = useTargetNetwork();
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  const { data: term, refetch: refetchTerm } = useScaffoldReadContract({
    contractName: "ClawdIntern",
    functionName: "getTerm",
    args: [termId],
    watch: true,
  });
  const { data: claimable, refetch: refetchClaimable } = useScaffoldReadContract({
    contractName: "ClawdIntern",
    functionName: "claimable",
    args: [termId],
    watch: true,
  });

  const { writeContractAsync: writeClawdIntern, isMining } = useScaffoldWriteContract({
    contractName: "ClawdIntern",
  });

  if (!term) {
    return (
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body items-center">
          <span className="loading loading-spinner loading-md" />
        </div>
      </div>
    );
  }

  const closed = term.closedAt > 0n;
  const status = term.cancelled
    ? { label: "Cancelled", cls: "badge-error" }
    : term.slashed
      ? { label: "Slashed", cls: "badge-warning" }
      : isActive
        ? { label: "Active", cls: "badge-success" }
        : closed && claimable !== undefined && term.payout > term.claimed
          ? { label: "Streaming", cls: "badge-info" }
          : closed
            ? { label: "Settled", cls: "badge-ghost" }
            : { label: "Expired — awaiting close", cls: "badge-warning" };

  const now = nowSec();
  const termProgress = Math.min(
    100,
    Math.max(0, ((now - Number(term.start)) / Math.max(1, Number(term.end) - Number(term.start))) * 100),
  );
  const streamEnd = Number(term.closedAt) + Number(term.streamLen);
  const streamProgress = closed
    ? Math.min(100, ((now - Number(term.closedAt)) / Math.max(1, Number(term.streamLen))) * 100)
    : 0;

  const gainBps = closed && term.markOut > term.markIn ? ((term.markOut - term.markIn) * 10000n) / term.markIn : 0n;

  const handleClaim = async () => {
    if (claimSubmitting) return;
    setClaimSubmitting(true);
    try {
      await writeClawdIntern({ functionName: "claim", args: [termId] });
      refetchTerm();
      refetchClaimable();
    } catch {
      notification.error("Claim failed — see wallet / console for details");
    } finally {
      setClaimSubmitting(false);
    }
  };

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center justify-between">
          <h3 className="card-title m-0">Term #{termId.toString()}</h3>
          <span className={`badge ${status.cls}`}>{status.label}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Intern:</span>
          <Address address={term.intern} chain={targetNetwork} />
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <span className="opacity-70">Budget</span>
          <span className="text-right font-mono">{formatClawd(term.budget, clawdPrice)}</span>
          <span className="opacity-70">Mark in</span>
          <span className="text-right font-mono">{formatMark(term.markIn)}</span>
          {closed && (
            <>
              <span className="opacity-70">Mark out</span>
              <span className="text-right font-mono">
                {formatMark(term.markOut)}{" "}
                <span className={gainBps > 0n ? "text-success" : "opacity-70"}>
                  ({gainBps > 0n ? `+${(Number(gainBps) / 100).toFixed(1)}%` : "no gain"})
                </span>
              </span>
              <span className="opacity-70">Payout</span>
              <span className="text-right font-mono">{formatClawd(term.payout, clawdPrice)}</span>
              <span className="opacity-70">Claimed</span>
              <span className="text-right font-mono">{formatClawd(term.claimed, clawdPrice)}</span>
            </>
          )}
        </div>

        {isActive && (
          <div>
            <div className="flex justify-between text-xs opacity-70 mb-1">
              <span>Term progress</span>
              <span>
                {now >= Number(term.end) ? "ended — owner can close" : `${formatDuration(Number(term.end) - now)} left`}
              </span>
            </div>
            <progress className="progress progress-success w-full" value={termProgress} max={100} />
          </div>
        )}

        {closed && !term.cancelled && term.payout > 0n && (
          <div>
            <div className="flex justify-between text-xs opacity-70 mb-1">
              <span>Vesting stream ({formatDuration(Number(term.streamLen))})</span>
              <span>
                {now >= streamEnd || term.slashed ? "fully vested" : `${formatDuration(streamEnd - now)} left`}
              </span>
            </div>
            <progress className="progress progress-info w-full" value={term.slashed ? 100 : streamProgress} max={100} />
          </div>
        )}

        {closed && claimable !== undefined && claimable > 0n && (
          <div className="card-actions items-center justify-between mt-1">
            <span className="text-sm">
              Claimable now: <span className="font-mono font-semibold">{formatClawd(claimable, clawdPrice)}</span>
            </span>
            <ActionGuard>
              <button className="btn btn-primary btn-sm" disabled={isMining || claimSubmitting} onClick={handleClaim}>
                {(isMining || claimSubmitting) && <span className="loading loading-spinner loading-sm mr-2" />}
                {isMining || claimSubmitting ? "Claiming..." : "Claim for intern"}
              </button>
            </ActionGuard>
          </div>
        )}
      </div>
    </div>
  );
};
