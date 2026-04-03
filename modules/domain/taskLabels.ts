/**
 * Strip UI prefixes used in project documents (⏳ / ✅ / markdown bullets).
 * Used for matching tasks across completion and deduplication.
 */
const LEADING_EMOJI_PREFIX = /^[\s>*-]*(?:[⏳✅]\s*)+/u;

export function stripTaskDisplayPrefix(text: string): string {
  let s = text.replace(/\r\n/g, "\n").trim();
  s = s.replace(/^[-*+]\s+/, "").trim();
  s = s.replace(LEADING_EMOJI_PREFIX, "").trim();
  return s;
}

export function normalizeTaskMatchKey(text: string): string {
  return stripTaskDisplayPrefix(text)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function formatIncompleteTaskLine(text: string): string {
  const core = stripTaskDisplayPrefix(text);
  return core ? `⏳ ${core}` : "";
}

export function formatCompletedTaskLine(text: string): string {
  const core = stripTaskDisplayPrefix(text);
  return core ? `✅ ${core}` : "";
}
