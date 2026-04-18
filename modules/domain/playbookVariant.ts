export type PlaybookVariant = 0 | 1;

/**
 * Deterministic variant index for A/B playbook copy (goals, tasks, RPM suggestions).
 * Same seed always yields the same index — do not use Math.random() for inbound flows.
 */
export function stableVariantIndex(seed: string, modulo = 2): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return Math.abs(hash) % modulo;
}
