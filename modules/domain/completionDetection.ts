const COMPLETION_KEYWORD =
  /\b(?:done|completed|finished|shipped|launched|deployed)\b/i;

/** Common English words to ignore when matching task text to sentences. */
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "have",
  "has",
  "was",
  "were",
  "are",
  "our",
  "your",
  "been",
  "being",
  "will",
  "just",
  "got",
  "get",
]);

function normalizeListItemKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Keep only completion lines that correspond to current action items (case-insensitive).
 */
export function filterCompletedToKnownTasks(items: string[], actionItems: string[]): string[] {
  const keys = new Set(actionItems.map(normalizeListItemKey));
  return items.filter((item) => keys.has(normalizeListItemKey(item)));
}

/**
 * Detect which existing tasks the user marked complete in free text (e.g. "Authentication is done").
 * Returns canonical strings from `existingTasks`.
 */
export function detectCompletedTasks(rawBody: string, existingTasks: string[]): string[] {
  if (existingTasks.length === 0 || !rawBody.trim()) {
    return [];
  }

  const sentences = rawBody
    .split(/[\n.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const completed: string[] = [];

  for (const task of existingTasks) {
    const words = significantWords(task);
    if (words.length === 0) {
      continue;
    }

    for (const sentence of sentences) {
      if (!COMPLETION_KEYWORD.test(sentence)) {
        continue;
      }
      const lower = sentence.toLowerCase();
      const hit = words.some((w) => lower.includes(w));
      if (hit) {
        completed.push(task);
        break;
      }
    }
  }

  return completed;
}
