"use client";

import { useState } from "react";
import { ActionGuard } from "./ActionGuard";
import { AddressInput } from "@scaffold-ui/components";
import { parseEther, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useWalletDeepLink } from "~~/hooks/useWalletDeepLink";
import { formatClawd } from "~~/utils/clawd";
import { notification } from "~~/utils/scaffold-eth";

const DAY = 86400;

/** Admin console — rendered only for the contract owner. */
export const OwnerPanel = ({
  activeTermId,
  clawdPrice,
  clawdInternAddress,
}: {
  activeTermId: bigint | undefined;
  clawdPrice: number;
  clawdInternAddress: string;
}) => {
  const { address } = useAccount();
  const hasActiveTerm = activeTermId !== undefined;

  // ---- open term form
  const [intern, setIntern] = useState("");
  const [markIn, setMarkIn] = useState("");
  const [budget, setBudget] = useState("");
  const [termDays, setTermDays] = useState("14");
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approveCooldown, setApproveCooldown] = useState(false);
  const [openSubmitting, setOpenSubmitting] = useState(false);

  // ---- close / cancel / slash / reassign
  const [markOut, setMarkOut] = useState("");
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [slashTermId, setSlashTermId] = useState("");
  const [slashReason, setSlashReason] = useState("");
  const [slashSubmitting, setSlashSubmitting] = useState(false);
  const [reassignTermId, setReassignTermId] = useState("");
  const [newIntern, setNewIntern] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);

  const { data: allowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, clawdInternAddress],
    watch: true,
  });
  const { data: ownerBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address],
    watch: true,
  });

  const { writeContractAsync: writeClawd, isMining: isApproveMining } = useScaffoldWriteContract({
    contractName: "CLAWD",
  });
  const { writeContractAsync: writeClawdIntern, isMining: isInternMining } = useScaffoldWriteContract({
    contractName: "ClawdIntern",
  });
  const { writeAndOpen } = useWalletDeepLink();

  const parsedBudget = (() => {
    try {
      return budget ? parseEther(budget) : 0n;
    } catch {
      return 0n;
    }
  })();
  const parsedMarkIn = (() => {
    try {
      return markIn ? parseUnits(markIn, 18) : 0n;
    } catch {
      return 0n;
    }
  })();
  const needsApproval = parsedBudget > 0n && (allowance === undefined || allowance < parsedBudget);
  const insufficientBalance = parsedBudget > 0n && ownerBalance !== undefined && ownerBalance < parsedBudget;

  const handleApprove = async () => {
    if (approvalSubmitting || approveCooldown) return;
    setApprovalSubmitting(true);
    try {
      await writeAndOpen(() => writeClawd({ functionName: "approve", args: [clawdInternAddress, parsedBudget] }));
      setApproveCooldown(true);
      setTimeout(() => {
        setApproveCooldown(false);
        refetchAllowance();
      }, 4000);
    } catch {
      notification.error("Approval failed");
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const handleOpen = async () => {
    if (openSubmitting) return;
    if (!intern || parsedMarkIn === 0n || parsedBudget === 0n || Number(termDays) <= 0) {
      notification.error("Fill in intern, mark-in price, budget and term length");
      return;
    }
    setOpenSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeClawdIntern({
          functionName: "openTerm",
          args: [intern, parsedMarkIn, parsedBudget, BigInt(Math.round(Number(termDays) * DAY))],
        }),
      );
      setIntern("");
      setBudget("");
      setMarkIn("");
    } catch {
      notification.error("openTerm failed — check cooldown / allowance / an already-active term");
    } finally {
      setOpenSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (closeSubmitting) return;
    let parsed: bigint;
    try {
      parsed = parseUnits(markOut, 18);
    } catch {
      notification.error("Enter the mark-out USD price");
      return;
    }
    if (parsed === 0n) {
      notification.error("Mark-out must be > 0");
      return;
    }
    setCloseSubmitting(true);
    try {
      await writeAndOpen(() => writeClawdIntern({ functionName: "closeTerm", args: [parsed] }));
      setMarkOut("");
    } catch {
      notification.error("closeTerm failed — term may still be running");
    } finally {
      setCloseSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (cancelSubmitting) return;
    if (!window.confirm("Cancel the active term? The full budget returns to the owner and the intern gets nothing.")) {
      return;
    }
    setCancelSubmitting(true);
    try {
      await writeAndOpen(() => writeClawdIntern({ functionName: "cancelTerm" }));
    } catch {
      notification.error("cancelTerm failed");
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handleSlash = async () => {
    if (slashSubmitting) return;
    if (slashTermId === "" || slashReason.trim().length === 0) {
      notification.error("Slash needs a term id and a public reason (it goes onchain)");
      return;
    }
    setSlashSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeClawdIntern({ functionName: "slash", args: [BigInt(slashTermId), slashReason.trim()] }),
      );
      setSlashTermId("");
      setSlashReason("");
    } catch {
      notification.error("slash failed — term must be closed 2+ days with an unvested remainder");
    } finally {
      setSlashSubmitting(false);
    }
  };

  const handleReassign = async () => {
    if (reassignSubmitting) return;
    if (reassignTermId === "" || !newIntern) {
      notification.error("Reassign needs a term id and the new intern address");
      return;
    }
    setReassignSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeClawdIntern({ functionName: "reassignIntern", args: [BigInt(reassignTermId), newIntern] }),
      );
      setReassignTermId("");
      setNewIntern("");
    } catch {
      notification.error("reassignIntern failed — term must be closed");
    } finally {
      setReassignSubmitting(false);
    }
  };

  return (
    <div className="card bg-base-100 border-2 border-primary/40">
      <div className="card-body gap-4">
        <h2 className="card-title m-0">Owner console</h2>
        {ownerBalance !== undefined && (
          <p className="m-0 text-sm opacity-70">Your CLAWD balance: {formatClawd(ownerBalance, clawdPrice)}</p>
        )}

        {!hasActiveTerm ? (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold m-0">Open a term</h3>
            <AddressInput value={intern} onChange={setIntern} placeholder="Intern address or ENS" />
            <label className="input input-bordered flex items-center gap-2 w-full">
              <span className="opacity-60 text-sm shrink-0">Mark-in $</span>
              <input
                className="grow min-w-0"
                placeholder="0.0000069"
                value={markIn}
                onChange={e => setMarkIn(e.target.value)}
              />
            </label>
            <label className="input input-bordered flex items-center gap-2 w-full">
              <span className="opacity-60 text-sm shrink-0">Budget</span>
              <input
                className="grow min-w-0"
                placeholder="1000000"
                value={budget}
                onChange={e => setBudget(e.target.value)}
              />
              <span className="opacity-60 text-sm shrink-0">CLAWD</span>
            </label>
            {parsedBudget > 0n && clawdPrice > 0 && (
              <p className="m-0 text-xs opacity-70">= {formatClawd(parsedBudget, clawdPrice)}</p>
            )}
            <label className="input input-bordered flex items-center gap-2 w-full">
              <span className="opacity-60 text-sm shrink-0">Term length</span>
              <input
                className="grow min-w-0"
                type="number"
                min="1"
                value={termDays}
                onChange={e => setTermDays(e.target.value)}
              />
              <span className="opacity-60 text-sm shrink-0">days</span>
            </label>
            {insufficientBalance && <p className="m-0 text-sm text-error">Budget exceeds your CLAWD balance.</p>}
            <ActionGuard>
              {needsApproval ? (
                <button
                  className="btn btn-primary"
                  disabled={
                    isApproveMining ||
                    approvalSubmitting ||
                    approveCooldown ||
                    parsedBudget === 0n ||
                    insufficientBalance
                  }
                  onClick={handleApprove}
                >
                  {(isApproveMining || approvalSubmitting || approveCooldown) && (
                    <span className="loading loading-spinner loading-sm mr-2" />
                  )}
                  {isApproveMining || approvalSubmitting
                    ? "Approving..."
                    : approveCooldown
                      ? "Confirming approval..."
                      : "Approve CLAWD budget"}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={isInternMining || openSubmitting || parsedBudget === 0n || insufficientBalance}
                  onClick={handleOpen}
                >
                  {(isInternMining || openSubmitting) && <span className="loading loading-spinner loading-sm mr-2" />}
                  {isInternMining || openSubmitting ? "Opening term..." : "Open term"}
                </button>
              )}
            </ActionGuard>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold m-0">Close the active term</h3>
            <label className="input input-bordered flex items-center gap-2 w-full">
              <span className="opacity-60 text-sm shrink-0">Mark-out $</span>
              <input
                className="grow min-w-0"
                placeholder="0.0000082"
                value={markOut}
                onChange={e => setMarkOut(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <ActionGuard>
                <button className="btn btn-primary" disabled={isInternMining || closeSubmitting} onClick={handleClose}>
                  {(isInternMining || closeSubmitting) && <span className="loading loading-spinner loading-sm mr-2" />}
                  {isInternMining || closeSubmitting ? "Closing..." : "Close term"}
                </button>
                <button
                  className="btn btn-error btn-outline"
                  disabled={isInternMining || cancelSubmitting}
                  onClick={handleCancel}
                >
                  {cancelSubmitting && <span className="loading loading-spinner loading-sm mr-2" />}
                  {cancelSubmitting ? "Cancelling..." : "Cancel term"}
                </button>
              </ActionGuard>
            </div>
            <p className="m-0 text-xs opacity-70">
              Close computes the payout from mark-out vs mark-in and starts the vesting stream. Cancel returns the full
              budget to you — the event trail is public either way.
            </p>
          </div>
        )}

        <div className="collapse collapse-arrow bg-base-200">
          <input type="checkbox" />
          <div className="collapse-title font-semibold">Stream controls (slash / reassign)</div>
          <div className="collapse-content flex flex-col gap-2">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  className="input input-bordered w-28"
                  placeholder="Term id"
                  type="number"
                  min="0"
                  value={slashTermId}
                  onChange={e => setSlashTermId(e.target.value)}
                />
                <input
                  className="input input-bordered grow"
                  placeholder="Public slash reason (emitted onchain)"
                  value={slashReason}
                  onChange={e => setSlashReason(e.target.value)}
                />
              </div>
              <ActionGuard>
                <button
                  className="btn btn-warning btn-sm w-fit"
                  disabled={isInternMining || slashSubmitting}
                  onClick={handleSlash}
                >
                  {slashSubmitting && <span className="loading loading-spinner loading-sm mr-2" />}
                  {slashSubmitting ? "Slashing..." : "Slash unvested remainder"}
                </button>
              </ActionGuard>
            </div>
            <div className="divider my-1" />
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 items-start flex-col sm:flex-row">
                <input
                  className="input input-bordered w-28"
                  placeholder="Term id"
                  type="number"
                  min="0"
                  value={reassignTermId}
                  onChange={e => setReassignTermId(e.target.value)}
                />
                <div className="grow w-full">
                  <AddressInput value={newIntern} onChange={setNewIntern} placeholder="New intern address or ENS" />
                </div>
              </div>
              <ActionGuard>
                <button
                  className="btn btn-secondary btn-sm w-fit"
                  disabled={isInternMining || reassignSubmitting}
                  onClick={handleReassign}
                >
                  {reassignSubmitting && <span className="loading loading-spinner loading-sm mr-2" />}
                  {reassignSubmitting ? "Reassigning..." : "Reassign intern (closed term)"}
                </button>
              </ActionGuard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
