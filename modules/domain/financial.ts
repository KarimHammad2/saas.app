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

/** @deprecated Kept for compatibility; normalization is tier-agnostic in MVP scope. */
export function applyTierFinancials(input: TransactionEvent, _tier: Tier): TransactionEvent {
  return normalizeTransactionEvent(input);
}
