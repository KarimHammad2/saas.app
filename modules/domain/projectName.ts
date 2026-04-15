const PROJECT_NAME_MAX_CHARS = 80;
const PROJECT_NAME_MIN_CHARS = 2;

const FILLER_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "for",
  "of",
  "with",
  "on",
  "in",
  "at",
  "by",
  "from",
  "into",
  "about",
  "like",
  "that",
  "this",
  "i",
  "im",
  "i'm",
  "m",
  "we",
  "were",
  "we're",
  "re",
  "ve",
  "ll",
  "d",
  "s",
  "want",
  "need",
  "would",
  "could",
  "should",
  "build",
  "create",
  "develop",
  "make",
  "launch",
  "start",
  "project",
]);

function toTitleWord(word: string): string {
  const upper = word.toUpperCase();
  if (word.length <= 4 && word === upper) {
    return upper;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripLeadingLabel(value: string): string {
  return value
    .replace(/^\s*project\s*name\s*:\s*/i, "")
    .replace(/^\s*rename\s+project\s+to\s*:\s*/i, "")
    .replace(/^\s*-\s+/, "")
    .trim();
}

export function normalizeProjectNameCandidate(input: string): string | null {
  const cleaned = normalizeWhitespace(stripLeadingLabel(input))
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .trim();

  if (!cleaned) {
    return null;
  }
  if (cleaned.length < PROJECT_NAME_MIN_CHARS) {
    return null;
  }
  if (!/[a-z0-9]/i.test(cleaned)) {
    return null;
  }

  return cleaned.slice(0, PROJECT_NAME_MAX_CHARS);
}

export function generateShortProjectName(input: string, fallback = "New Project"): string {
  const normalized = normalizeWhitespace(input);
  if (!normalized) {
    return fallback;
  }

  const rawWords = normalized
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  const meaningfulWords = rawWords.filter((word) => !FILLER_WORDS.has(word.toLowerCase()));
  const source = meaningfulWords.length > 0 ? meaningfulWords : rawWords;
  const selected = source.slice(0, 5).map(toTitleWord);
  const candidate = normalizeProjectNameCandidate(selected.join(" "));
  if (candidate) {
    return candidate;
  }

  return normalizeProjectNameCandidate(fallback) || "New Project";
}
