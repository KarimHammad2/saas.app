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

/**
 * Extracts a display name from a From header like `Jane Doe <jane@example.com>`.
 * Returns null for bare addresses or if the local part looks like the only token.
 */
export function extractDisplayNameFromSenderRaw(senderRaw: string, normalizedEmail: string): string | null {
  const trimmed = senderRaw.trim();
  if (!trimmed) {
    return null;
  }
  const angleMatch = trimmed.match(/^(.+?)\s*<[^>]+>\s*$/);
  if (!angleMatch) {
    return null;
  }
  let name = angleMatch[1].trim().replace(/^["']|["']$/g, "").trim();
  if (!name || name.toLowerCase() === normalizedEmail) {
    return null;
  }
  if (name.includes("@") && !name.includes(" ")) {
    return null;
  }
  return name.slice(0, 200);
}
