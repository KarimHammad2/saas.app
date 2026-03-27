/** Compact text for the Overview section — digest for LLMs, not full raw input. */
const OVERVIEW_MAX_CHARS = 320;

export function compactOverviewForDocument(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= OVERVIEW_MAX_CHARS) {
    return normalized;
  }

  const sentenceBreak = normalized.match(/^(.+?[.!?])(\s|$)/);
  const first = sentenceBreak?.[1]?.trim();
  if (first && first.length >= 40 && first.length <= OVERVIEW_MAX_CHARS) {
    return first;
  }

  const slice = normalized.slice(0, OVERVIEW_MAX_CHARS);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trimEnd();
  return `${trimmed}…`;
}
