/** Plain-text money labels for outbound email and project markdown (checkout currency). */

export function formatMoneyAmountForEmail(amount: number, currency: string): string {
  const c = currency.trim().toLowerCase();
  const n = Number(Number(amount).toFixed(2));
  if (c === "cad") {
    return `CA$${n}`;
  }
  return `$${n}`;
}

export function formatHourlyRateForEmail(hourlyRate: number, currency: string): string {
  return `${formatMoneyAmountForEmail(hourlyRate, currency)}/hour`;
}
