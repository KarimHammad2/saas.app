import type { Tier, TransactionEvent } from "@/modules/contracts/types";

function round(value: number): number {
  return Number(value.toFixed(4));
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function normalizeTransactionEvent(input: TransactionEvent): TransactionEvent {
  const hoursPurchased = clampNonNegative(input.hoursPurchased);
  const hourlyRate = clampNonNegative(input.hourlyRate);
  const allocatedHours = clampNonNegative(input.allocatedHours);
  const bufferHours = clampNonNegative(input.bufferHours);
  const saas2Fee = clampNonNegative(input.saas2Fee);
  const projectRemainder = clampNonNegative(input.projectRemainder);

  return {
    ...input,
    hoursPurchased: round(hoursPurchased),
    hourlyRate: round(hourlyRate),
    allocatedHours: round(allocatedHours),
    bufferHours: round(bufferHours),
    saas2Fee: round(saas2Fee),
    projectRemainder: round(projectRemainder),
  };
}

export interface HourPurchaseSplit {
  allocatedHours: number;
  bufferHours: number;
  saas2Fee: number;
  projectRemainder: number;
}

/**
 * Computes hour buckets from purchased hours H and account tier.
 * Solo (freemium + solopreneur): 90/10 buffer with 5% SaaS² + 5% remainder inside buffer.
 * Agency: 90/10 buffer with 2.5% SaaS² + 7.5% remainder inside buffer.
 */
export function computeHourPurchaseSplit(hoursPurchased: number, tier: Tier): HourPurchaseSplit {
  const H = clampNonNegative(hoursPurchased);
  const allocatedHours = round(H * 0.9);
  const bufferHours = round(H * 0.1);
  const isAgency = tier === "agency";
  const saas2Fee = round(H * (isAgency ? 0.025 : 0.05));
  const projectRemainder = round(H * (isAgency ? 0.075 : 0.05));
  return { allocatedHours, bufferHours, saas2Fee, projectRemainder };
}

/** Applies tier-based splits; only `hoursPurchased`, `hourlyRate`, and `tier` matter for derived fields. */
export function applyTierFinancials(input: TransactionEvent, tier: Tier): TransactionEvent {
  const hourlyRate = clampNonNegative(input.hourlyRate);
  const hoursPurchased = clampNonNegative(input.hoursPurchased);
  const split = computeHourPurchaseSplit(hoursPurchased, tier);
  return normalizeTransactionEvent({
    ...input,
    hoursPurchased,
    hourlyRate,
    ...split,
  });
}
