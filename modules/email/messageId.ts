/** Normalize Message-Id / In-Reply-To values for storage and lookup (RFC 5322). */
export function normalizeMessageId(raw: string): string {
  return raw
    .trim()
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
}
