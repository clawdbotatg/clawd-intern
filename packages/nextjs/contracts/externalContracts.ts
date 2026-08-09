import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

/**
 * Live contracts on Base (chain 8453).
 *
 * ClawdIntern deployed 2026-08-07 (Sourcify-verified):
 *   https://basescan.org/address/0xc447bC73F4101726Ae4496C3586047b5F920dcCD
 */
const externalContracts = {
  8453: {
    ClawdIntern: {
      address: "0xc447bC73F4101726Ae4496C3586047b5F920dcCD",
      deployedOnBlock: 49629507,
      abi: [
        {
          type: "constructor",
          inputs: [
            {
              name: "_clawd",
              type: "address",
              internalType: "contract IERC20",
            },
            {
              name: "_owner",
              type: "address",
              internalType: "address",
            },
            {
              name: "_gainCapBps",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "_streamLength",
              type: "uint64",
              internalType: "uint64",
            },
            {
              name: "_cooldown",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "BPS",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "NONE",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "SLASH_DELAY",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "acceptOwnership",
          inputs: [],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "activeTermId",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "cancelTerm",
          inputs: [],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "claim",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "claimable",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "clawd",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "address",
              internalType: "contract IERC20",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "closeTerm",
          inputs: [
            {
              name: "markOut",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "cooldown",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "currentIntern",
          inputs: [],
          outputs: [
            {
              name: "intern",
              type: "address",
              internalType: "address",
            },
            {
              name: "termId",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "endsAt",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "gainCapBps",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "getTerm",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [
            {
              name: "",
              type: "tuple",
              internalType: "struct ClawdIntern.Term",
              components: [
                {
                  name: "intern",
                  type: "address",
                  internalType: "address",
                },
                {
                  name: "start",
                  type: "uint64",
                  internalType: "uint64",
                },
                {
                  name: "end",
                  type: "uint64",
                  internalType: "uint64",
                },
                {
                  name: "closedAt",
                  type: "uint64",
                  internalType: "uint64",
                },
                {
                  name: "streamLen",
                  type: "uint64",
                  internalType: "uint64",
                },
                {
                  name: "capBps",
                  type: "uint256",
                  internalType: "uint256",
                },
                {
                  name: "markIn",
                  type: "uint256",
                  internalType: "uint256",
                },
                {
                  name: "markOut",
                  type: "uint256",
                  internalType: "uint256",
                },
                {
                  name: "budget",
                  type: "uint256",
                  internalType: "uint256",
                },
                {
                  name: "payout",
                  type: "uint256",
                  internalType: "uint256",
                },
                {
                  name: "claimed",
                  type: "uint256",
                  internalType: "uint256",
                },
                {
                  name: "cancelled",
                  type: "bool",
                  internalType: "bool",
                },
                {
                  name: "slashed",
                  type: "bool",
                  internalType: "bool",
                },
              ],
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "lastTermEnd",
          inputs: [
            {
              name: "",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "openTerm",
          inputs: [
            {
              name: "intern",
              type: "address",
              internalType: "address",
            },
            {
              name: "markIn",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "budget",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "termLength",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          outputs: [
            {
              name: "termId",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "owner",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "address",
              internalType: "address",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "pendingOwner",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "address",
              internalType: "address",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "reassignIntern",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "newIntern",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "renounceOwnership",
          inputs: [],
          outputs: [],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "rescue",
          inputs: [
            {
              name: "token",
              type: "address",
              internalType: "contract IERC20",
            },
            {
              name: "to",
              type: "address",
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "setParams",
          inputs: [
            {
              name: "_gainCapBps",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "_streamLength",
              type: "uint64",
              internalType: "uint64",
            },
            {
              name: "_cooldown",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "slash",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "reason",
              type: "string",
              internalType: "string",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "streamLength",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "termCount",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "terms",
          inputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [
            {
              name: "intern",
              type: "address",
              internalType: "address",
            },
            {
              name: "start",
              type: "uint64",
              internalType: "uint64",
            },
            {
              name: "end",
              type: "uint64",
              internalType: "uint64",
            },
            {
              name: "closedAt",
              type: "uint64",
              internalType: "uint64",
            },
            {
              name: "streamLen",
              type: "uint64",
              internalType: "uint64",
            },
            {
              name: "capBps",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "markIn",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "markOut",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "budget",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "payout",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "claimed",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "cancelled",
              type: "bool",
              internalType: "bool",
            },
            {
              name: "slashed",
              type: "bool",
              internalType: "bool",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "transferOwnership",
          inputs: [
            {
              name: "newOwner",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "event",
          name: "Claimed",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "intern",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "InternReassigned",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "oldIntern",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "newIntern",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "OwnershipTransferStarted",
          inputs: [
            {
              name: "previousOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "newOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "OwnershipTransferred",
          inputs: [
            {
              name: "previousOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "newOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "ParamsUpdated",
          inputs: [
            {
              name: "gainCapBps",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "streamLength",
              type: "uint64",
              indexed: false,
              internalType: "uint64",
            },
            {
              name: "cooldown",
              type: "uint64",
              indexed: false,
              internalType: "uint64",
            },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "Slashed",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "vestedKept",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "returned",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "reason",
              type: "string",
              indexed: false,
              internalType: "string",
            },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "TermCancelled",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "returned",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "TermClosed",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "markOut",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "gainBps",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "payout",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "surplus",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "TermOpened",
          inputs: [
            {
              name: "termId",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "intern",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "markIn",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "budget",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "start",
              type: "uint64",
              indexed: false,
              internalType: "uint64",
            },
            {
              name: "end",
              type: "uint64",
              indexed: false,
              internalType: "uint64",
            },
            {
              name: "capBps",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "streamLen",
              type: "uint64",
              indexed: false,
              internalType: "uint64",
            },
          ],
          anonymous: false,
        },
        {
          type: "error",
          name: "CannotRescueClawd",
          inputs: [],
        },
        {
          type: "error",
          name: "InternOnCooldown",
          inputs: [],
        },
        {
          type: "error",
          name: "NoActiveTerm",
          inputs: [],
        },
        {
          type: "error",
          name: "NothingToClaim",
          inputs: [],
        },
        {
          type: "error",
          name: "NothingToSlash",
          inputs: [],
        },
        {
          type: "error",
          name: "OwnableInvalidOwner",
          inputs: [
            {
              name: "owner",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          type: "error",
          name: "OwnableUnauthorizedAccount",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          type: "error",
          name: "ReentrancyGuardReentrantCall",
          inputs: [],
        },
        {
          type: "error",
          name: "RenounceDisabled",
          inputs: [],
        },
        {
          type: "error",
          name: "SafeERC20FailedOperation",
          inputs: [
            {
              name: "token",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          type: "error",
          name: "SlashTooEarly",
          inputs: [],
        },
        {
          type: "error",
          name: "TermAlreadyActive",
          inputs: [],
        },
        {
          type: "error",
          name: "TermAlreadySettled",
          inputs: [],
        },
        {
          type: "error",
          name: "TermNotClosed",
          inputs: [],
        },
        {
          type: "error",
          name: "TermStillRunning",
          inputs: [],
        },
        {
          type: "error",
          name: "TransferAmountMismatch",
          inputs: [],
        },
        {
          type: "error",
          name: "ZeroAddress",
          inputs: [],
        },
        {
          type: "error",
          name: "ZeroAmount",
          inputs: [],
        },
      ] as const,
    },
    CLAWD: {
      address: "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07",
      abi: [
        {
          type: "function",
          name: "name",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "string",
            },
          ],
        },
        {
          type: "function",
          name: "symbol",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "string",
            },
          ],
        },
        {
          type: "function",
          name: "decimals",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "uint8",
            },
          ],
        },
        {
          type: "function",
          name: "totalSupply",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "uint256",
            },
          ],
        },
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [
            {
              name: "account",
              type: "address",
            },
          ],
          outputs: [
            {
              type: "uint256",
            },
          ],
        },
        {
          type: "function",
          name: "allowance",
          stateMutability: "view",
          inputs: [
            {
              name: "owner",
              type: "address",
            },
            {
              name: "spender",
              type: "address",
            },
          ],
          outputs: [
            {
              type: "uint256",
            },
          ],
        },
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            {
              name: "spender",
              type: "address",
            },
            {
              name: "amount",
              type: "uint256",
            },
          ],
          outputs: [
            {
              type: "bool",
            },
          ],
        },
        {
          type: "function",
          name: "transfer",
          stateMutability: "nonpayable",
          inputs: [
            {
              name: "to",
              type: "address",
            },
            {
              name: "amount",
              type: "uint256",
            },
          ],
          outputs: [
            {
              type: "bool",
            },
          ],
        },
        {
          type: "event",
          name: "Transfer",
          inputs: [
            {
              name: "from",
              type: "address",
              indexed: true,
            },
            {
              name: "to",
              type: "address",
              indexed: true,
            },
            {
              name: "value",
              type: "uint256",
              indexed: false,
            },
          ],
        },
        {
          type: "event",
          name: "Approval",
          inputs: [
            {
              name: "owner",
              type: "address",
              indexed: true,
            },
            {
              name: "spender",
              type: "address",
              indexed: true,
            },
            {
              name: "value",
              type: "uint256",
              indexed: false,
            },
          ],
        },
      ] as const,
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
