/**
 * Rule-based task intent classification for free-text project updates (no LLM).
 * COMPLETE_TASK free-text completion is handled separately by `detectCompletedTasks`;
 * this module focuses on START / CREATE / UPDATE and UNKNOWN fallbacks.
 */

import { normalizeTaskMatchKey } from "@/modules/domain/taskLabels";

export type TaskIntent = "COMPLETE_TASK" | "START_TASK" | "CREATE_TASK" | "UPDATE_TASK" | "UNKNOWN";

export interface TaskIntentEvent {
  intent: TaskIntent;
  /** Original sentence from the message. */
  rawSentence: string;
  /** Canonical task string from `existingTasks` when fuzzy-matched. */
  matchedTask: string | null;
  /** Extracted subject phrase (task hint). */
  taskHint: string;
  /** For UPDATE_TASK: new action item text (status preserved as incomplete). */
  updatedText?: string;
}

const COMPLETION_KEYWORD =
  /\b(?:done|completed|finished|implemented|shipped|launched|deployed)\b/i;

const UPDATE_PATTERN =
  /\b(?:change|update|modify|revise)\s+(.+?)\s+to\s+(.+)/i;

const START_PATTERN =
  /\b(?:working\s+on|started(?:\s+on)?|starting(?:\s+on)?|began(?:\s+with)?)\s+(.+)/i;

const CREATE_PATTERN =
  /^(?:we\s+should|we\s+need\s+to|need\s+to|i\s+need\s+to|should\s+add|let['']s\s+add|let\s+us\s+add|add)\s+/i;

const CREATE_LEADING_VERB = /^(?:add|create|build|implement)\s+/i;
const CREATE_A_AN = /^(?:create|build|implement)\s+(?:a|an|the)\s+/i;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Lowercase, strip punctuation, collapse whitespace (per universal task spec).
 */
export function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fuzzy match: existing task line contains normalized hint, or hint contains normalized task.
 */
export function matchTask(taskHint: string, tasks: string[]): string | null {
  const h = normalizeTaskMatchKey(taskHint);
  if (!h) {
    return null;
  }
  for (const task of tasks) {
    const t = normalizeTaskMatchKey(task);
    if (!t) {
      continue;
    }
    if (t.includes(h) || h.includes(t)) {
      return task;
    }
  }
  return null;
}

/**
 * Strip common intent prefixes/suffixes and return a short subject for matching.
 */
export function extractTaskHint(message: string, intent: TaskIntent): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "";
  }

  if (intent === "UPDATE_TASK") {
    const m = trimmed.match(UPDATE_PATTERN);
    if (m?.[1]) {
      return m[1].trim();
    }
  }

  if (intent === "START_TASK") {
    const m = trimmed.match(START_PATTERN);
    if (m?.[1]) {
      return m[1].replace(/\.$/, "").trim();
    }
  }

  if (intent === "CREATE_TASK") {
    let rest = trimmed.replace(CREATE_PATTERN, "").trim();
    rest = rest.replace(CREATE_A_AN, "").trim();
    rest = rest.replace(CREATE_LEADING_VERB, "").trim();
    return rest.replace(/\.$/, "").trim();
  }

  if (intent === "COMPLETE_TASK") {
    let s = trimmed
      .replace(/\b(?:is|are|was|were)\s+(?:done|completed|finished|implemented)\b.*$/i, "")
      .replace(/\b(?:done|completed|finished|implemented|shipped|launched|deployed)\b.*$/i, "")
      .trim();
    s = s.replace(/^i(?:'ve| have)\s+/i, "").replace(/^we(?:'ve| have)\s+/i, "").trim();
    return s.replace(/\.$/, "").trim();
  }

  return trimmed.replace(/\.$/, "").trim();
}

/**
 * Classify a single sentence (no multi-sentence aggregation).
 */
export function classifyTaskMessage(sentence: string): TaskIntent {
  const s = sentence.trim();
  if (!s) {
    return "UNKNOWN";
  }

  if (UPDATE_PATTERN.test(s)) {
    return "UPDATE_TASK";
  }

  if (START_PATTERN.test(s)) {
    return "START_TASK";
  }

  if (CREATE_PATTERN.test(s) || /^(?:add|create|build|implement)\s+/i.test(s)) {
    return "CREATE_TASK";
  }

  if (COMPLETION_KEYWORD.test(s)) {
    return "COMPLETE_TASK";
  }

  return "UNKNOWN";
}

function parseUpdateDetail(sentence: string): { beforeTo: string; afterTo: string } | null {
  const m = sentence.match(UPDATE_PATTERN);
  if (!m?.[1] || !m?.[2]) {
    return null;
  }
  return { beforeTo: m[1].trim(), afterTo: m[2].trim() };
}

/**
 * Split body into sentences and emit actionable task events.
 * Skips COMPLETE_TASK (handled by `detectCompletedTasks` in orchestration).
 */
export function applyTaskIntents(
  rawBody: string,
  existingTasks: string[],
  completedTasks: string[] = [],
): TaskIntentEvent[] {
  if (!rawBody.trim()) {
    return [];
  }

  const sentences = rawBody
    .split(/[\n.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const events: TaskIntentEvent[] = [];
  const allKnownTasks = [...existingTasks, ...completedTasks];

  for (const sentence of sentences) {
    const intent = classifyTaskMessage(sentence);

    if (intent === "COMPLETE_TASK") {
      continue;
    }

    if (intent === "UPDATE_TASK") {
      const parsed = parseUpdateDetail(sentence);
      if (!parsed) {
        if (shouldEmitUnknown(sentence)) {
          events.push({
            intent: "UNKNOWN",
            rawSentence: sentence,
            matchedTask: null,
            taskHint: "",
          });
        }
        continue;
      }
      const hint = extractTaskHint(sentence, "UPDATE_TASK");
      const matched = matchTask(hint, existingTasks);
      if (!matched) {
        if (shouldEmitUnknown(sentence)) {
          events.push({
            intent: "UNKNOWN",
            rawSentence: sentence,
            matchedTask: null,
            taskHint: hint,
          });
        }
        continue;
      }
      const detail = parsed.afterTo.replace(/\.$/, "").trim();
      const updatedText = `${matched} (${detail})`;
      events.push({
        intent: "UPDATE_TASK",
        rawSentence: sentence,
        matchedTask: matched,
        taskHint: hint,
        updatedText,
      });
      continue;
    }

    if (intent === "START_TASK") {
      const hint = extractTaskHint(sentence, "START_TASK");
      const matched = hint ? matchTask(hint, existingTasks) : null;
      events.push({
        intent: "START_TASK",
        rawSentence: sentence,
        matchedTask: matched,
        taskHint: hint,
      });
      continue;
    }

    if (intent === "CREATE_TASK") {
      const hint = extractTaskHint(sentence, "CREATE_TASK");
      const matched = hint ? matchTask(hint, allKnownTasks) : null;
      if (matched) {
        continue;
      }
      events.push({
        intent: "CREATE_TASK",
        rawSentence: sentence,
        matchedTask: null,
        taskHint: hint || sentence,
      });
      continue;
    }

    if (shouldEmitUnknown(sentence)) {
      events.push({
        intent: "UNKNOWN",
        rawSentence: sentence,
        matchedTask: null,
        taskHint: "",
      });
    }
  }

  return events;
}

/** Skip list-like fragments and very short noise for Notes fallback. */
function shouldEmitUnknown(sentence: string): boolean {
  const s = sentence.trim();
  if (countWords(s) < 4) {
    return false;
  }
  if (/^\s*[-*]\s/.test(s)) {
    return false;
  }
  return true;
}
