const SCOPE_CHANGE_PATTERNS = [
  /we\s+are\s+no\s+longer\s+doing/i,
  /change\s+direction/i,
  /instead\s+we\s+will/i,
  /new\s+plan/i,
];

const DIRECTION_REGEX =
  /(?:we\s+are\s+no\s+longer\s+doing|change\s+direction(?:\s+from)?|instead\s+we\s+will|new\s+plan[:\s-]*)\s*(.+?)(?:\s*(?:now|instead)\s+(?:it'?s|it\s+is)\s+|\s*[,;:-]\s*now\s+|\s*->\s*|\s*→\s*)\s*(.+)$/i;

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
  if (!m?.[1] || !m?.[2]) {
    return null;
  }
  const fromScope = cleanScopePart(m[1]);
  const toScope = cleanScopePart(m[2]);
  if (!fromScope || !toScope) {
    return null;
  }
  return { fromScope, toScope };
}
