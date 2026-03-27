import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

export interface KickoffSummary {
  summary: string;
  goals: string[];
  constraints: string[];
  nextSteps: string[];
}

function inferGoals(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /goal|objective|need|want/i.test(line))
    .slice(0, 5);
}

function inferConstraints(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /constraint|budget|deadline|timeline|limit/i.test(line))
    .slice(0, 5);
}

export function buildKickoffSummary(event: NormalizedEmailEvent): KickoffSummary {
  const summary = compactOverviewForDocument(event.parsed.summary || event.rawBody);
  const goals = event.parsed.goals.length > 0 ? event.parsed.goals : inferGoals(event.rawBody);
  const constraints = inferConstraints(event.rawBody);
  const nextSteps = [
    'Reply to this email with any updates.',
    'Ask Frank for help by starting your message with "Frank...".',
    "Forward or CC emails to frank@saas2.app to save your project state.",
  ];

  return { summary, goals, constraints, nextSteps };
}
