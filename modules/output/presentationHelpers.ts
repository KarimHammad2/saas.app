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
      return '(No goals defined yet - reply with "Goals:" to add them.)';
    case "tasks":
      return '(No tasks defined yet - reply with "Tasks:" or "Action Items:" to add them.)';
    case "risks":
      return '(No risks tracked yet - reply with "Risks:" to capture top concerns.)';
    case "notes":
      return '(No notes yet - reply with "Notes:" to preserve important context.)';
    case "decisions":
      return '(No decisions logged yet - reply with "Decisions:" to record key choices.)';
    case "recommendations":
      return '(No recommendations yet - reply with "Recommendations:" to capture advice.)';
    default:
      return "(No updates yet)";
  }
}

function pickNextStep(context: ProjectContext): string {
  if (context.goals.length === 0) {
    return 'Define 2-3 goals by replying with a "Goals:" section.';
  }
  if (context.actionItems.length === 0) {
    return 'Define the first execution tasks by replying with a "Tasks:" section.';
  }
  if (context.risks.length === 0) {
    return 'Add your top 2-3 risks by replying with a "Risks:" section.';
  }
  if (context.notes.length === 0) {
    return 'Add notes from your latest thinking by replying with a "Notes:" section.';
  }
  return "Keep momentum by sending your next project update.";
}

function deriveStatus(context: ProjectContext): string {
  if (context.goals.length === 0 && context.actionItems.length === 0) {
    return "Early Stage";
  }
  if (context.goals.length > 0 && context.actionItems.length === 0) {
    return "Defining Scope";
  }
  if (context.actionItems.length > 0 && context.risks.length === 0) {
    return "Planning Execution";
  }
  return "Execution";
}

export function computeProjectProgress(context: ProjectContext): ProjectProgress {
  const checkpoints = [
    Boolean(context.summary.trim()),
    context.goals.length > 0,
    context.actionItems.length > 0,
    context.risks.length > 0,
    context.notes.length > 0,
  ];
  const completed = checkpoints.filter(Boolean).length;
  const completeness = Math.round((completed / checkpoints.length) * 100);
  return {
    projectStatus: deriveStatus(context),
    completeness,
    nextStep: pickNextStep(context),
  };
}

function inferSuggestionCategory(content: string): string {
  const text = content.toLowerCase();
  if (/\brisk|blocker|concern\b/.test(text)) {
    return "Risks";
  }
  if (/\bvalidate|validation|interview|users?\b/.test(text)) {
    return "Validation";
  }
  if (/\bprice|pricing|plan|subscription|billing\b/.test(text)) {
    return "Pricing";
  }
  if (/\bmvp|scope|feature\b/.test(text)) {
    return "Scope";
  }
  return "Suggestion";
}

export interface HumanSuggestion {
  label: string;
  content: string;
}

export function toHumanSuggestions(pendingSuggestions: RPMSuggestion[]): HumanSuggestion[] {
  const unique = dedupePreserveOrder(pendingSuggestions.map((item) => item.content));
  return unique.map((content) => ({
    label: inferSuggestionCategory(content),
    content,
  }));
}
