import type { UserProfileStructuredContext } from "@/modules/contracts/types";
import type { JsonRecord } from "@/modules/domain/userProfileMerge";

interface MemoryInferenceInput {
  summary?: string | null;
  rawBody?: string | null;
  goals?: string[];
  notes?: string[];
}

export interface MemoryInferenceResult {
  sowSignals: Partial<UserProfileStructuredContext>;
  constraints: JsonRecord;
}

function compactText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferIndustry(text: string): string | undefined {
  const lowered = text.toLowerCase();
  const directMatch = lowered.match(/\bsaas\s+(?:for|to)\s+([a-z][a-z0-9\s-]{2,40})\b/);
  if (directMatch?.[1]) {
    const cleaned = directMatch[1].split(/\b(?:and|with|using|while)\b/i)[0] ?? directMatch[1];
    return cleaned.trim().replace(/[.!,;:]$/, "");
  }

  const lookup: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\brestaurant|food service|cafe\b/, label: "restaurants" },
    { pattern: /\bhealthcare|clinic|medical\b/, label: "healthcare" },
    { pattern: /\beducation|school|student\b/, label: "education" },
    { pattern: /\becommerce|retail|shop\b/, label: "ecommerce" },
    { pattern: /\bconstruction|contractor\b/, label: "construction" },
  ];
  const hit = lookup.find((entry) => entry.pattern.test(lowered));
  return hit?.label;
}

function inferProjectType(text: string): string | undefined {
  const lowered = text.toLowerCase();
  if (/\bsaas\b/.test(lowered)) {
    return "SaaS";
  }
  if (/\bmarketplace\b/.test(lowered)) {
    return "Marketplace";
  }
  if (/\bmobile app\b|\bios app\b|\bandroid app\b/.test(lowered)) {
    return "Mobile App";
  }
  if (/\bapi\b|\bplatform\b/.test(lowered)) {
    return "Platform";
  }
  return undefined;
}

function inferProjectStage(text: string): string | undefined {
  const lowered = text.toLowerCase();
  if (/\bidea\b|\bjust starting\b|\bexploring\b/.test(lowered)) {
    return "idea";
  }
  if (/\bdefine|scope|validate|research\b/.test(lowered)) {
    return "discovery";
  }
  if (/\bmvp\b|\bprototype\b|\bbuild\b/.test(lowered)) {
    return "building";
  }
  if (/\bbeta\b|\bpilot\b|\blaunch\b/.test(lowered)) {
    return "launch";
  }
  return undefined;
}

function inferConstraintHints(text: string): JsonRecord {
  const lowered = text.toLowerCase();
  const out: JsonRecord = {};
  if (/\blow budget\b|\bdon't have much budget\b|\bno budget\b|\bnot much budget\b|\b(?:very|pretty) tight budget\b|\b(?:tight|small) budget\b/.test(lowered)) {
    out.budget = "low";
  }
  if (/\b(?:evenings?|nights?|only at night)\b|only (?:after|in the) evening\b/.test(lowered)) {
    out.availability = "evenings";
  }
  if (/\b(?:weekends?|saturday|sunday)\b.*\b(?:only|available)\b|\bonly (?:on )?weekends?\b/.test(lowered)) {
    out.availability = "weekends";
  }
  return out;
}

export function inferMemorySignals(input: MemoryInferenceInput): MemoryInferenceResult {
  const source = compactText([
    input.summary,
    input.rawBody,
    ...(input.goals ?? []),
    ...(input.notes ?? []),
  ]);
  if (!source) {
    return { sowSignals: {}, constraints: {} };
  }

  const industry = inferIndustry(source);
  const projectType = inferProjectType(source);
  const projectStage = inferProjectStage(source);
  const constraints = inferConstraintHints(source);

  const sowSignals: Partial<UserProfileStructuredContext> = {};
  if (industry) {
    sowSignals.industry = industry;
  }
  if (projectType) {
    sowSignals.project_type = projectType;
  }
  if (projectStage) {
    sowSignals.project_stage = projectStage;
  }

  return { sowSignals, constraints };
}
