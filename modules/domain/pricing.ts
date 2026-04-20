import type { Tier } from "@/modules/contracts/types";

export interface TierTransitionInput {
  currentTier: Tier;
  hasTransactionEvent: boolean;
  totalAccountEmails: number;
}

export function getNextTier(input: TierTransitionInput): Tier {
  if (input.totalAccountEmails > 1) {
    return "agency";
  }

  // Freemium → solopreneur is deferred until payment is confirmed (inbound "Paid"), not on transaction receipt.
  void input.hasTransactionEvent;

  return input.currentTier;
}

export function getSaasFeeRate(tier: Tier): number {
  if (tier === "agency") {
    return 0.025;
  }
  if (tier === "solopreneur") {
    return 0.05;
  }
  return 0;
}
