const SCOPE_CHANGE_PATTERNS = [
  /we\s+are\s+no\s+longer\b/i,
  /\binstead\b/i,
  /\bswitch(?:ing)?\s+to\b/i,
  /\bchang(?:e|ing)\s+direction\b/i,
  /\bpivot(?:ing|ed)?\b/i,
  /\btoo\s+expensive,\s*now\s+we\s+want\b/i,
  /\brather\s+than\b/i,
];

const DIRECTION_REGEX =
  /(?:we\s+are\s+no\s+longer(?:\s+building|\s+doing)?|switch(?:ing)?\s+from|changing?\s+direction(?:\s+from)?|pivot(?:ing|ed)?(?:\s+from)?|rather\s+than)\s+(.+?)(?:\s*(?:to|instead|now)\s+|\s*[,;:-]\s*(?:now\s+)?(?:we\s+want|instead)\s+|\s*->\s*|\s*→\s*)\s*(.+)$/i;

const FROM_SCOPE_REGEX = /we\s+are\s+no\s+longer(?:\s+building|\s+doing)?\s+(.+?)(?:[.!,;:]|$)/i;
const TO_SCOPE_REGEXES = [
  /instead[,:\s-]*(?:we\s+want|we\s+need|we\s+are\s+building|we'?re\s+building)?\s*(.+)$/i,
  /(?:we\s+want|we\s+need|we\s+are\s+building|we'?re\s+building)\s+(.+?)\s+instead\b/i,
  /switch(?:ing)?\s+to\s+(.+)$/i,
  /now\s+we\s+want\s+(.+)$/i,
];

export function detectProjectScopeChange(rawBody: string): boolean {
  const t = rawBody.trim();
  if (!t) {
    return false;
  }
  return SCOPE_CHANGE_PATTERNS.some((rx) => rx.test(t));
}

export interface ScopeTransition {
  fromScope: string;
  toScope: string;
}

function cleanScopePart(value: string): string {
  return value
    .replace(/^we\s+want\s+/i, "")
    .replace(/^it'?s\s+/i, "")
    .replace(/^it\s+is\s+/i, "")
    .replace(/^["'`]/, "")
    .replace(/["'`]$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!,;:]$/, "");
}

export function extractScopeTransition(rawBody: string): ScopeTransition | null {
  const t = rawBody.trim();
  if (!t) {
    return null;
  }
  const m = t.match(DIRECTION_REGEX);
  if (m?.[1] && m?.[2]) {
    const fromScope = cleanScopePart(m[1]);
    const toScope = cleanScopePart(m[2]);
    if (fromScope && toScope) {
      return { fromScope, toScope };
    }
  }

  const fromMatch = t.match(FROM_SCOPE_REGEX);
  const fromScope = cleanScopePart(fromMatch?.[1] ?? "");
  if (!fromScope) {
    return null;
  }

  let toScope = "";
  for (const rx of TO_SCOPE_REGEXES) {
    const tm = t.match(rx);
    const candidate = cleanScopePart(tm?.[1] ?? "");
    if (candidate) {
      toScope = candidate;
      break;
    }
  }
  if (!toScope) {
    return null;
  }

  return { fromScope, toScope };
}
