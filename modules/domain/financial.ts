import type { Tier, TransactionEvent } from "@/modules/contracts/types";
import { getSaasFeeRate } from "@/modules/domain/pricing";

function round(value: number): number {
  return Number(value.toFixed(4));
}

export function applyTierFinancials(input: TransactionEvent, tier: Tier): TransactionEvent {
  const feeRate = getSaasFeeRate(tier);
  const bufferHours = input.bufferHours > 0 ? input.bufferHours : input.hoursPurchased * 0.1;
  const allocatedHours = input.allocatedHours > 0 ? input.allocatedHours : input.hoursPurchased - bufferHours;
  const saas2Fee = feeRate === 0 ? input.saas2Fee : input.hoursPurchased * feeRate;
  const projectRemainder =
    input.projectRemainder > 0 ? input.projectRemainder : Math.max(0, bufferHours - saas2Fee);

  return {
    ...input,
    bufferHours: round(bufferHours),
    allocatedHours: round(allocatedHours),
    saas2Fee: round(saas2Fee),
    projectRemainder: round(projectRemainder),
  };
}
