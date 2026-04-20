export type CcMembershipDecision = "approve" | "reject" | "unknown";

const APPROVE_PATTERNS = [
  /\byes\b/i,
  /\bok(?:ay)?\b/i,
  /\bgo\s+ahead\b/i,
  /\bplease\s+do\b/i,
  /\bsounds?\s+good\b/i,
  /\bconfirmed?\b/i,
  /\badd\b.*\bthem\b/i,
  /\badd\b.*\bmember/i,
  /\bapprove\b/i,
];

const REJECT_PATTERNS = [
  /\bno\b/i,
  /\bdon'?t\s+add\b/i,
  /\bdo\s+not\s+add\b/i,
  /\breject\b/i,
];

export function parseCcMembershipDecision(text: string): CcMembershipDecision {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (REJECT_PATTERNS.some((rx) => rx.test(normalized))) {
    return "reject";
  }
  if (APPROVE_PATTERNS.some((rx) => rx.test(normalized))) {
    return "approve";
  }
  return "unknown";
}
