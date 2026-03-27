import type { ProjectContext, UserProfileContext } from "@/modules/contracts/types";

const SYSTEM_SENDER = "system@saas2.app";

/**
 * Rule-based RPM-style suggestions from current project + profile state.
 * Replace with LLM output later if needed.
 */
export function generateRPMSuggestions(projectState: ProjectContext, userProfile: UserProfileContext): string[] {
  const lines: string[] = [];

  if (projectState.goals.length === 0 && !projectState.summary?.trim()) {
    lines.push("Write a one-paragraph summary of the problem you are solving and add it under Summary in your next email.");
  }

  if (projectState.risks.length === 0) {
    lines.push("List the top 2–3 risks you are worried about so we can track them explicitly.");
  }

  if (projectState.decisions.length === 0 && projectState.goals.length > 0) {
    lines.push("Capture one explicit decision you have already made (even if small) under Decisions.");
  }

  if (projectState.recommendations.length === 0) {
    lines.push("Consider validating your idea with at least 5 target users before building more scope.");
  }

  if (/\bmvp\b|mvp_first/i.test(JSON.stringify(projectState)) || userProfile.structuredContext?.goals_style === "mvp_first") {
    lines.push("Stay focused on a thin MVP: ship one core workflow before expanding features.");
  } else {
    lines.push("Define a simple pricing hypothesis early, even if you change it later.");
  }

  return Array.from(new Set(lines)).slice(0, 5);
}

export function getSystemRpmSenderEmail(): string {
  return SYSTEM_SENDER;
}
