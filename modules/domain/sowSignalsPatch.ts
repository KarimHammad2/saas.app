import type { UserProfileStructuredContext } from "@/modules/contracts/types";
import { mergeUniqueStringsPreserveOrder } from "@/modules/domain/mergeUniqueStrings";

/** Parse JSONB / unknown into structured SOW signals (legacy flat `context` rows included). */
export function parseSowSignalsFromUnknown(value: unknown): UserProfileStructuredContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const o = value as Record<string, unknown>;
  const prefs = o.preferences;
  const preferencesList = Array.isArray(o.preferencesList)
    ? o.preferencesList.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
    : [];
  return {
    role: typeof o.role === "string" ? o.role : undefined,
    business: typeof o.business === "string" ? o.business : undefined,
    preferencesList: preferencesList.length > 0 ? preferencesList : undefined,
    business_type: typeof o.business_type === "string" ? o.business_type : undefined,
    goals_style: typeof o.goals_style === "string" ? o.goals_style : undefined,
    preferences:
      prefs && typeof prefs === "object" && !Array.isArray(prefs) ? (prefs as Record<string, unknown>) : undefined,
    tone: typeof o.tone === "string" ? o.tone : undefined,
    industry: typeof o.industry === "string" ? o.industry : undefined,
    project_type: typeof o.project_type === "string" ? o.project_type : undefined,
    project_stage: typeof o.project_stage === "string" ? o.project_stage : undefined,
  };
}

/** Merge partial SOW / structured signals into existing (used for user_profiles.context.sowSignals). */
export function applyStructuredPatch(
  existing: UserProfileStructuredContext,
  patch: Partial<UserProfileStructuredContext>,
): UserProfileStructuredContext {
  const next: UserProfileStructuredContext = {
    ...existing,
  };

  if (patch.role) {
    next.role = patch.role;
  }
  if (patch.business) {
    next.business = patch.business;
  }
  if (patch.preferencesList && patch.preferencesList.length > 0) {
    next.preferencesList = mergeUniqueStringsPreserveOrder(existing.preferencesList ?? [], patch.preferencesList);
  }
  if (patch.business_type) {
    next.business_type = patch.business_type;
  }
  if (patch.goals_style) {
    next.goals_style = patch.goals_style;
  }
  if (patch.preferences) {
    next.preferences = { ...(existing.preferences ?? {}), ...patch.preferences };
  }
  if (patch.tone) {
    next.tone = patch.tone;
  }
  if (patch.industry) {
    next.industry = patch.industry;
  }
  if (patch.project_type) {
    next.project_type = patch.project_type;
  }
  if (patch.project_stage) {
    next.project_stage = patch.project_stage;
  }

  return next;
}
