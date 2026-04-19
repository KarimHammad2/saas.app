import type { UserProfileStructuredContext } from "@/modules/contracts/types";
import { applyStructuredPatch } from "@/modules/domain/sowSignalsPatch";
import type { JsonRecord } from "@/modules/domain/userProfileMerge";

function dedupePreserveOrder(values: string[]): string[] {
  return Array.from(new Set(values.map((entry) => entry.trim()).filter(Boolean)));
}

/** Deterministic extraction from RPM suggestion text (used for approved inbound suggestions). */
export function parseSuggestionIntoStructuredContext(content: string): Partial<UserProfileStructuredContext> {
  const text = content.trim();
  if (!text) {
    return {};
  }

  const lowered = text.toLowerCase();
  const patch: Partial<UserProfileStructuredContext> = {};

  const roleMatch = lowered.match(/\b(?:i am|i'm|im)\s+(?:a|an)?\s*([a-z][a-z\s-]{2,40})\s+building\b/);
  if (roleMatch?.[1]) {
    patch.role = roleMatch[1].replace(/\s+/g, " ").trim();
  } else if (/\bsolo founder\b/.test(lowered)) {
    patch.role = "solo founder";
  }

  const businessMatch = lowered.match(/\bbuilding\s+(?:a|an)?\s*([a-z0-9][a-z0-9\s-]{1,40})\b/);
  if (businessMatch?.[1]) {
    patch.business = businessMatch[1].replace(/\s+/g, " ").trim().replace(/[.!,;:]$/, "");
  } else if (/\bsaas\b/.test(lowered)) {
    patch.business = "SaaS";
  }

  const preferenceMatches = [
    ...text.matchAll(/\b(?:prefers?|preference|likes?|wants?)\s+([a-z0-9][a-z0-9\s-]{2,60})/gi),
    ...text.matchAll(/\b(short answers?|concise answers?|brief answers?)\b/gi),
  ];
  const preferenceList = dedupePreserveOrder(
    preferenceMatches
      .map((match) => (match[1] ?? match[0] ?? "").trim().replace(/[.!,;:]$/, ""))
      .filter(Boolean),
  );
  if (preferenceList.length > 0) {
    patch.preferencesList = preferenceList;
  }

  return patch;
}

/**
 * When an inbound RPM profile suggestion is approved: replace long-form instructions and `sowSignals`
 * with this suggestion only (never append/merge with prior profile memory).
 */
export function applyApprovedInboundRpmSuggestionToContext(base: JsonRecord, suggestionContent: string): JsonRecord {
  const trimmed = suggestionContent.trim();
  if (!trimmed) {
    return base;
  }

  const structuredPatch = parseSuggestionIntoStructuredContext(trimmed);
  const nextSow = applyStructuredPatch({} as UserProfileStructuredContext, structuredPatch);

  return {
    ...base,
    longTermInstructions: [trimmed],
    sowSignals: nextSow as unknown as JsonRecord,
  };
}
