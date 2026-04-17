/** Normalize for case-insensitive list dedupe; collapse internal whitespace. */
export function normalizeListItemKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Merge incoming into existing, preserving first-seen casing and skipping case-duplicates. */
export function mergeUniqueStringsPreserveOrder(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of existing) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeListItemKey(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  for (const raw of incoming) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeListItemKey(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
