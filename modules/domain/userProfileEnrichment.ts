import type { NormalizedEmailEvent, UserProfileStructuredContext } from "@/modules/contracts/types";

function mergeDefined<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) {
      continue;
    }
    if (typeof v === "string" && !v.trim()) {
      continue;
    }
    if (typeof v === "object" && !Array.isArray(v) && v !== null) {
      out[k as keyof T] = { ...(out[k as keyof T] as object), ...(v as object) } as T[keyof T];
    } else {
      out[k as keyof T] = v as T[keyof T];
    }
  }
  return out;
}

/**
 * Lightweight heuristics for SOW profile signals; replace with LLM later if needed.
 */
export function extractProfileSignals(rawBody: string): UserProfileStructuredContext {
  const text = rawBody.toLowerCase();
  const out: UserProfileStructuredContext = {};

  const roleMatch = text.match(/\b(?:i am|i'm|im)\s+(?:a|an)?\s*([a-z][a-z\s-]{2,40})\s+building\b/);
  if (roleMatch?.[1]) {
    out.role = roleMatch[1].replace(/\s+/g, " ").trim();
  } else if (/\bsolo founder\b/.test(text)) {
    out.role = "solo founder";
  }

  const businessMatch = text.match(/\bbuilding\s+(?:a|an)?\s*([a-z0-9][a-z0-9\s-]{1,40})\b/);
  if (businessMatch?.[1]) {
    const business = businessMatch[1].replace(/\s+/g, " ").trim().replace(/[.!,;:]$/, "");
    out.business = business.toUpperCase() === "SAAS" ? "SaaS" : business;
  } else if (/\bsaas\b|\bsoftware as a service\b/.test(text)) {
    out.business = "SaaS";
  }

  const preferencesList = [
    ...rawBody.matchAll(/\b(?:prefers?|preference|likes?|wants?)\s+([a-z0-9][a-z0-9\s-]{2,60})/gi),
    ...rawBody.matchAll(/\b(short answers?|concise answers?|brief answers?)\b/gi),
  ]
    .map((match) => (match[1] ?? match[0] ?? "").trim().replace(/[.!,;:]$/, ""))
    .filter(Boolean);
  if (preferencesList.length > 0) {
    out.preferencesList = Array.from(new Set(preferencesList));
  }

  if (/\bsolo founder\b|\bindie\b|\bone[- ]person\b|\bfounder\b/.test(text)) {
    out.business_type = "solo_founder";
  } else if (/\bstartup\b|\bsmall team\b/.test(text)) {
    out.business_type = "startup_team";
  } else if (/\benterprise\b|\bfortune\b/.test(text)) {
    out.business_type = "enterprise";
  }

  if (/\bb2b\b/.test(text)) {
    out.preferences = { ...out.preferences, market: "B2B" };
  }
  if (/\bb2c\b|\bd2c\b/.test(text)) {
    out.preferences = { ...out.preferences, market: "B2C" };
  }
  if (/\bsaas\b|\bsoftware as a service\b/.test(text)) {
    out.preferences = { ...out.preferences, product_type: "SaaS" };
  }

  if (/\bmvp\b|\bprototype\b|\bproof of concept\b|\bpoc\b/.test(text)) {
    out.goals_style = "mvp_first";
  } else if (/\bscale\b|\bgrowth\b|\bseries [a-z]\b/.test(text)) {
    out.goals_style = "growth_scale";
  }

  if (/\bcasual\b|\bhey\b|\bthanks!\b/.test(text)) {
    out.tone = "casual";
  } else if (/\bplease\b|\bdear\b|\bkind regards\b/.test(text)) {
    out.tone = "formal";
  } else if (/\bdirect\b|\bdeadline\b|\basap\b/.test(text)) {
    out.tone = "direct";
  }

  return out;
}

export function mergeStructuredProfile(
  existing: UserProfileStructuredContext,
  extracted: UserProfileStructuredContext,
): UserProfileStructuredContext {
  const nextPreferencesList = Array.from(new Set([...(existing.preferencesList ?? []), ...(extracted.preferencesList ?? [])]));
  return {
    role: extracted.role ?? existing.role,
    business: extracted.business ?? existing.business,
    preferencesList: nextPreferencesList.length > 0 ? nextPreferencesList : undefined,
    business_type: extracted.business_type ?? existing.business_type,
    goals_style: extracted.goals_style ?? existing.goals_style,
    tone: extracted.tone ?? existing.tone,
    preferences: mergeDefined(
      (existing.preferences ?? {}) as Record<string, unknown>,
      (extracted.preferences ?? {}) as Record<string, unknown>,
    ) as Record<string, unknown>,
  };
}

export function enrichUserProfileFromEmailSignals(
  existing: UserProfileStructuredContext,
  event: NormalizedEmailEvent,
): UserProfileStructuredContext {
  const fromBody = extractProfileSignals(event.rawBody);
  return mergeStructuredProfile(existing, fromBody);
}
