import { compactOverviewForDocument } from "@/modules/output/overviewText";

export interface RuleBasedOverviewInput {
  initialOverview: string;
  goals: string[];
  notes: string[];
}

/**
 * Deterministic overview line from first input + latest goals + recent notes (no AI).
 */
export function combineRuleBasedOverview(input: RuleBasedOverviewInput): string {
  const goalPart = input.goals.slice(0, 3).filter(Boolean).join("; ");
  const notePart = input.notes.slice(-3).filter(Boolean).join(" ");
  const parts = [
    input.initialOverview.trim(),
    goalPart ? `Goals: ${goalPart}` : "",
    notePart ? `Notes: ${notePart}` : "",
  ].filter(Boolean);
  return compactOverviewForDocument(parts.join(" "));
}
