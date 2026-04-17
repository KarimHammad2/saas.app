import type { UserProfileStructuredContext } from "@/modules/contracts/types";
import { mergeUniqueStringsPreserveOrder } from "@/modules/domain/mergeUniqueStrings";
import { applyStructuredPatch, parseSowSignalsFromUnknown } from "@/modules/domain/sowSignalsPatch";

export type JsonRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deep-merge plain objects for user_profiles.context JSONB.
 * Arrays are merged only for `longTermInstructions` (concat + dedupe).
 * `sowSignals` uses applyStructuredPatch (SOW fields).
 */
export function deepMergeUserProfileContext(base: JsonRecord, patch: JsonRecord): JsonRecord {
  const out: JsonRecord = { ...base };

  for (const [key, patchVal] of Object.entries(patch)) {
    if (patchVal === undefined) {
      continue;
    }

    if (key === "longTermInstructions" && Array.isArray(patchVal)) {
      const existing = Array.isArray(out[key])
        ? (out[key] as unknown[]).filter((e): e is string => typeof e === "string")
        : [];
      out[key] = mergeUniqueStringsPreserveOrder(
        existing,
        patchVal.filter((e): e is string => typeof e === "string"),
      );
      continue;
    }

    if (key === "sowSignals" && isPlainObject(patchVal)) {
      const prev = parseSowSignalsFromUnknown(out[key]);
      const merged = applyStructuredPatch(prev, patchVal as Partial<UserProfileStructuredContext>);
      out[key] = merged as unknown as Record<string, unknown>;
      continue;
    }

    if (isPlainObject(patchVal) && isPlainObject(out[key])) {
      out[key] = deepMergeUserProfileContext(out[key] as JsonRecord, patchVal);
      continue;
    }

    out[key] = patchVal;
  }

  return out;
}
