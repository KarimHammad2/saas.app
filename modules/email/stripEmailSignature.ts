/**
 * Remove typical email signature blocks (closing line + name/title/footer) from the end of the
 * current message. Runs after quoted-thread stripping; does not remove quoted history.
 */

/** Whole-line closings only (trailing comma/punctuation optional). */
const CLOSING_LINE =
  /^(?:best regards|kind regards|warm regards|with regards|regards|sincerely|yours sincerely|yours truly|yours cordially|cordially|cordialement|mit freundlichen grüßen|mit freundlichen gruessen|mit freundlichem gruß|mit freundlichem gruss|viele grüße|viele gruesse|bis bald|mit besten grüßen|thanks(?:\s+again)?|thank you|many thanks|with thanks|with appreciation|appreciatively|cheers|best|yours|respectfully|faithfully)(?:[,.!?:)\s]*)?\s*$/i;

const MOBILE_OR_CLIENT_FOOTER =
  /^sent from\s+(?:my\s+)?(?:iphone|ipad|ipod|android|mobile|blackberry|windows phone)/i;

const OUTLOOK_FOOTER = /^get outlook for/i;

function isFooterLine(trimmed: string): boolean {
  return (
    MOBILE_OR_CLIENT_FOOTER.test(trimmed) ||
    OUTLOOK_FOOTER.test(trimmed) ||
    /^sent from\s+mail\s+for\s+windows/i.test(trimmed)
  );
}

function isLikelySignatureTailLine(trimmed: string): boolean {
  if (!trimmed) {
    return true;
  }
  if (trimmed.length <= 140) {
    return true;
  }
  if (/\S+@\S+/.test(trimmed)) {
    return true;
  }
  if (/\b\+?\d[\d\s().-]{7,}\b/.test(trimmed)) {
    return true;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }
  return false;
}

function tailIsSignatureOnly(lines: string[], startIndex: number): boolean {
  for (let j = startIndex + 1; j < lines.length; j += 1) {
    const t = lines[j]?.trim() ?? "";
    if (!t) {
      continue;
    }
    if (!isLikelySignatureTailLine(t)) {
      return false;
    }
  }
  return true;
}

function isClosingLine(trimmed: string): boolean {
  return CLOSING_LINE.test(trimmed);
}

function isSignatureAnchorLine(trimmed: string): boolean {
  if (!trimmed) {
    return false;
  }
  if (isClosingLine(trimmed)) {
    return true;
  }
  if (isFooterLine(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Drops the signature block from the end of plain text: the anchor line (closing or mobile footer)
 * and everything after it, when the tail still looks like a signature (short lines, emails, etc.).
 */
export function stripEmailSignature(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const trimmed = lines[i]?.trim() ?? "";
    if (!trimmed) {
      continue;
    }
    if (!isSignatureAnchorLine(trimmed)) {
      continue;
    }
    if (!tailIsSignatureOnly(lines, i)) {
      continue;
    }
    const kept = lines.slice(0, i).join("\n");
    return kept.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "").trimEnd();
  }

  return normalized.replace(/\n{3,}/g, "\n\n").trimEnd();
}
