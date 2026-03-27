import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

export interface KickoffSummary {
  summary: string;
  goals: string[];
  initialNotes: string[];
  constraints: string[];
  nextSteps: string[];
}

/** Phase 1: only explicit `Goals:` / structured sections — no keyword inference from raw body. */
export function buildKickoffSummary(event: NormalizedEmailEvent): KickoffSummary {
  const summary = compactOverviewForDocument(event.parsed.summary || event.rawBody);
  const goals = [...event.parsed.goals];
  const initialNotes = event.parsed.notes.length > 0 ? [...event.parsed.notes] : [];
  const constraints: string[] = [];
  const nextSteps = [
    "Your project has been initialized.",
    "Next, you may want to define timeline, target users, and first milestone.",
    "Reply to this email with updates in labeled sections to keep memory structured.",
  ];

  return { summary, goals, initialNotes, constraints, nextSteps };
}

/** Structured follow-ups for the first reply (timeline, budget, users). */
export function getKickoffFollowUpQuestions(): string[] {
  return [
    "Define your target timeline.",
    "Define your primary target users.",
    "Define your first milestone.",
  ];
}
