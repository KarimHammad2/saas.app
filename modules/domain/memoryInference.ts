import type { UserProfileStructuredContext } from "@/modules/contracts/types";

interface MemoryInferenceInput {
  summary?: string | null;
  rawBody?: string | null;
  goals?: string[];
  notes?: string[];
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

export function inferMemorySignals(input: MemoryInferenceInput): Partial<UserProfileStructuredContext> {
  const source = compactText([
    input.summary,
    input.rawBody,
    ...(input.goals ?? []),
    ...(input.notes ?? []),
  ]);
  if (!source) {
    return {};
  }

  const industry = inferIndustry(source);
  const projectType = inferProjectType(source);
  const projectStage = inferProjectStage(source);

  return {
    industry,
    project_type: projectType,
    project_stage: projectStage,
  };
}
