/**
 * Parses a single RFC-like email token (bare or "Name <addr@domain>") to lowercase bare address.
 * Returns null if no valid email is found.
 */
export function tryNormalizeEmailAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const angleMatch = trimmed.match(/<([^>]+)>/);
  const candidate = angleMatch?.[1] ?? trimmed;
  const normalized = candidate.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}
