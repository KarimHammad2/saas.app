/** Reject ultra-short or punctuation-only note lines (e.g. "....") so they are not persisted. */
export function isIgnoredNoteInput(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length < 5) {
    return true;
  }
  if (/^[.\-_ ]+$/.test(trimmed)) {
    return true;
  }
  const compact = trimmed
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(?:hi|hello|hey)(?:\s+(?:frank|team|there))?$/.test(compact) ||
    /^(?:thanks|thank you|thx|ok|okay|noted|got it|sounds good|sgtm|cool)(?:\s+(?:frank|team))?$/.test(compact)
  ) {
    return true;
  }
  return false;
}

export function filterIgnoredNoteLines(lines: string[]): string[] {
  return lines.filter((line) => !isIgnoredNoteInput(line));
}
