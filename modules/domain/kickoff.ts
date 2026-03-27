import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

export interface KickoffSummary {
  summary: string;
  goals: string[];
  constraints: string[];
  nextSteps: string[];
}

/** Phase 1: only explicit `Goals:` / structured sections — no keyword inference from raw body. */
export function buildKickoffSummary(event: NormalizedEmailEvent): KickoffSummary {
  const summary = compactOverviewForDocument(event.parsed.summary || event.rawBody);
  const goals = [...event.parsed.goals];
  const constraints: string[] = [];
  const nextSteps = [
    'Reply to this email with any updates.',
    'Ask Frank for help by starting your message with "Frank...".',
    "Send email to frank@saas2.app to save your project state.",
  ];

  return { summary, goals, constraints, nextSteps };
}

/** Structured follow-ups for the first reply (timeline, budget, users). */
export function getKickoffFollowUpQuestions(): string[] {
  return [
    "What is your target timeline or launch date?",
    "What budget range are you working with (rough order of magnitude is fine)?",
    "Who are your primary target users or customers?",
  ];
}
