import { normalizeTaskMatchKey } from "@/modules/domain/taskLabels";

const COMPLETION_KEYWORD =
  /\b(?:done|completed|finished|shipped|launched|deployed)\b/i;

const IS_DONE_PHRASE = /\b(?:is|are)\s+(?:done|completed|finished)\b/i;
const NEGATED_COMPLETION =
  /\b(?:not|isn'?t|aren'?t|wasn'?t|weren'?t)\b[^.!?\n]{0,24}\b(?:done|completed|finished|shipped|launched|deployed)\b/i;

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
  const keys = new Set(actionItems.map(normalizeTaskMatchKey));
  return items.filter((item) => keys.has(normalizeTaskMatchKey(item)));
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
      if (NEGATED_COMPLETION.test(sentence)) {
        continue;
      }
      const completionSignal = COMPLETION_KEYWORD.test(sentence) || IS_DONE_PHRASE.test(sentence);
      if (!completionSignal) {
        continue;
      }
      const lower = sentence.toLowerCase();
      const taskKey = normalizeTaskMatchKey(task);
      const hit =
        words.some((w) => lower.includes(w)) ||
        (taskKey.length >= 4 && lower.includes(taskKey.slice(0, Math.min(taskKey.length, 40))));
      if (hit) {
        completed.push(task);
        break;
      }
    }
  }

  return completed;
}

function sentenceHasCompletionSignal(sentence: string): boolean {
  if (NEGATED_COMPLETION.test(sentence)) {
    return false;
  }
  return COMPLETION_KEYWORD.test(sentence) || IS_DONE_PHRASE.test(sentence);
}

function normalizeSentenceKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Extract completion-like free text that could not be confidently mapped to known tasks.
 * These lines should be preserved in Notes instead of being dropped.
 */
export function extractUnmatchedCompletionNotes(rawBody: string, matchedTasks: string[]): string[] {
  if (!rawBody.trim()) {
    return [];
  }

  const sentences = rawBody
    .split(/[\n.!?]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);

  const seen = new Set<string>();
  const unmatched: string[] = [];

  for (const sentence of sentences) {
    if (!sentenceHasCompletionSignal(sentence)) {
      continue;
    }

    const lower = sentence.toLowerCase();
    const mapsToKnownCompleted = matchedTasks.some((task) => {
      const words = significantWords(task);
      if (words.some((w) => lower.includes(w))) {
        return true;
      }
      const taskKey = normalizeTaskMatchKey(task);
      return taskKey.length >= 4 && lower.includes(taskKey.slice(0, Math.min(taskKey.length, 40)));
    });

    if (mapsToKnownCompleted) {
      continue;
    }

    const key = normalizeSentenceKey(sentence);
    if (!seen.has(key)) {
      seen.add(key);
      unmatched.push(sentence);
    }
  }

  return unmatched;
}
