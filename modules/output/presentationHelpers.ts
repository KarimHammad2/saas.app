import type { ProjectContext, RPMSuggestion } from "@/modules/contracts/types";

export interface ProjectProgress {
  projectStatus: string;
  completeness: number;
  nextStep: string;
}

type GuidanceSection = "goals" | "tasks" | "risks" | "notes" | "decisions" | "recommendations";
type RestaurantSegment = "small_restaurants" | "chains" | "cloud_kitchens" | "generic";

export function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}

function detectRestaurantSegment(summary: string): RestaurantSegment {
  const lowered = summary.toLowerCase();
  if (/\b(?:cloud kitchen|ghost kitchen|dark kitchen|delivery[- ]only)\b/.test(lowered)) {
    return "cloud_kitchens";
  }
  if (/\b(?:chain|franchise|multi[- ]location|multiple locations)\b/.test(lowered)) {
    return "chains";
  }
  if (/\b(?:restaurant|restaurants|cafe|cafes|bistro|qsr|food truck)\b/.test(lowered)) {
    return "small_restaurants";
  }
  return "generic";
}

function contextAwarePlaceholder(section: GuidanceSection, context: ProjectContext): string | null {
  const segment = detectRestaurantSegment(context.summary);
  if (segment === "generic") {
    return null;
  }

  switch (section) {
    case "goals":
      return segment === "chains"
        ? "(No goals yet. Define chain-focused goals: multi-location ops, reporting, and branch consistency.)"
        : segment === "cloud_kitchens"
          ? "(No goals yet. Define delivery-first goals: order flow, dispatch, and throughput.)"
          : "(No goals yet. Define how restaurants will use your SaaS (reservations, orders, or CRM).)";
    case "tasks":
      return segment === "chains"
        ? "(No tasks yet. Start with pilot tasks for 2-3 locations and role setup.)"
        : segment === "cloud_kitchens"
          ? "(No tasks yet. Start with delivery workflow tasks and first integration setup.)"
          : "(No tasks yet. List first setup tasks for restaurant onboarding and daily operations.)";
    case "risks":
      return "(No risks yet. Track adoption risk, integration complexity, and operational bottlenecks.)";
    case "notes":
      return "(No notes yet. Add field notes about restaurant workflows and edge cases.)";
    default:
      return null;
  }
}

export function getGuidedEmptyPlaceholder(section: GuidanceSection, context?: ProjectContext): string {
  if (context) {
    const custom = contextAwarePlaceholder(section, context);
    if (custom) {
      return custom;
    }
  }

  switch (section) {
    case "goals":
      return "(No goals yet. Define your first 2-3 goals.)";
    case "tasks":
      return "(No tasks yet. List the first tasks to get started.)";
    case "risks":
      return "(No risks tracked yet. Note the main blockers to watch.)";
    case "notes":
      return "(No notes yet. Add useful context from your latest thinking.)";
    case "decisions":
      return "(No decisions logged yet. Capture key choices as they happen.)";
    case "recommendations":
      return "(No recommendations yet. Add ideas worth considering next.)";
    default:
      return "(No updates yet)";
  }
}

export function buildKickoffNextSteps(context: ProjectContext): string[] {
  const segment = detectRestaurantSegment(context.summary);
  const steps: string[] = [];

  if (context.goals.length === 0) {
    steps.push(
      segment === "generic"
        ? "Define your first 2-3 goals."
        : "Define how restaurants will use your SaaS (reservations, orders, CRM, or loyalty).",
    );
  } else {
    steps.push("Confirm your top goals for this first phase.");
  }

  if (context.actionItems.length === 0) {
    steps.push(
      segment === "generic"
        ? "List the first tasks to get started."
        : "List your first build tasks for onboarding, operations flow, and reporting.",
    );
  } else {
    steps.push("Start executing the first tasks and share updates.");
  }

  if (segment === "generic") {
    steps.push("Clarify your target users and first milestone.");
  } else {
    steps.push("Choose your target segment: small restaurants, chains, or cloud kitchens.");
  }

  return dedupePreserveOrder(steps);
}

function pickNextStep(context: ProjectContext): string {
  if (context.goals.length === 0 || context.actionItems.length === 0) {
    return buildKickoffNextSteps(context)[0] ?? "Define your first 2-3 goals.";
  }
  if (context.risks.length === 0) {
    return "Call out the top risks that could slow you down.";
  }
  if (context.notes.length === 0) {
    return "Add notes from your latest thinking.";
  }
  return "Keep momentum by sending your next project update.";
}

function deriveStatus(context: ProjectContext): string {
  if (context.goals.length === 0 && context.actionItems.length === 0) {
    return "Early Stage";
  }
  if (context.goals.length > 0 && context.actionItems.length === 0) {
    return "Planning";
  }
  if (context.actionItems.length > 0) {
    return "In Progress";
  }
  return "In Progress";
}

export function computeProjectProgress(context: ProjectContext): ProjectProgress {
  let score = 0;
  if (context.goals.length > 0) {
    score += 25;
  }
  if (context.actionItems.length > 0) {
    score += 25;
  }
  if (context.risks.length > 0) {
    score += 20;
  }
  if (context.notes.length > 0) {
    score += 10;
  }
  if (context.usageCount > 2) {
    score += 20;
  }
  const completeness = Math.min(100, score);

  return {
    projectStatus: deriveStatus(context),
    completeness,
    nextStep: pickNextStep(context),
  };
}

export function toHumanSuggestions(pendingSuggestions: RPMSuggestion[]): string[] {
  return dedupePreserveOrder(pendingSuggestions.map((item) => item.content));
}
