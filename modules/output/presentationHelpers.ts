import type { ProjectContext, RPMSuggestion } from "@/modules/contracts/types";

export interface ProjectProgress {
  projectStatus: string;
  completeness: number;
  nextStep: string;
}

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

export function getGuidedEmptyPlaceholder(section: "goals" | "tasks" | "risks" | "notes" | "decisions" | "recommendations"): string {
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

function pickNextStep(context: ProjectContext): string {
  if (context.goals.length === 0) {
    return "Define your first 2-3 goals.";
  }
  if (context.actionItems.length === 0) {
    return "List the first tasks to get started.";
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
  let completeness = 10;

  if (context.goals.length > 0) {
    completeness = 30;
  }

  if (context.actionItems.length > 0) {
    completeness = 50;
  }

  if (context.actionItems.length > 0 && context.risks.length > 0) {
    completeness = 65;
  }

  if (context.actionItems.length > 0 && context.risks.length > 0 && context.notes.length > 0) {
    completeness = 80;
  }

  return {
    projectStatus: deriveStatus(context),
    completeness,
    nextStep: pickNextStep(context),
  };
}

export function toHumanSuggestions(pendingSuggestions: RPMSuggestion[]): string[] {
  return dedupePreserveOrder(pendingSuggestions.map((item) => item.content));
}
