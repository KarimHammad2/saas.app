import type { ProjectEmailPayload } from "@/modules/output/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";
import { dedupePreserveOrder } from "@/modules/output/presentationHelpers";
import { formatCompletedTaskLine, formatIncompleteTaskLine } from "@/modules/domain/taskLabels";

const LLM_INSTRUCTIONS = `Your role:

 - Help the user think through this project
 - Suggest next steps
 - Identify risks, blockers, and improvements
 - Help the user make progress on the project
 - Prepare structured updates that can be sent to Frank

Scope rules:

 - Stay focused on this project and anything directly related to it
 - Only discuss topics that help move this project forward
 - Do not switch into general advice unrelated to the project
 - If the user asks unrelated questions, gently bring them back to the project
 - If needed, explain that your role here is to help with this project and suggest returning to the main subject

When interacting with the user:

 - Be clear, practical, and actionable
 - Use bullet points instead of long paragraphs when useful
 - Avoid unnecessary explanations
 - Focus on progress, clarity, and decisions
 - Help break big ideas into manageable next steps

Conversation boundary:
 - This conversation should remain centered on the project in this file.
 - If the user changes the subject to something unrelated, briefly redirect them back to the project and ask what they want to update, decide, or solve next.

Keeping Frank updated:

 - After meaningful progress, decisions, changes, or new information, prepare a structured update for Frank
 - Always format updates using the exact project update structure in this document
 - Only include sections that changed
 - Do NOT rewrite the full project unless explicitly asked
 - Keep updates concise and structured
 - End important working sessions by giving the user a ready-to-send update for Frank

The user may copy your structured updates and send them by email to Frank.`;

function formatBulletSection(values: string[], emptyPlaceholder: string): string {
  const uniqueValues = dedupePreserveOrder(values);
  if (uniqueValues.length === 0) {
    return emptyPlaceholder;
  }
  return uniqueValues.map((line) => `- ${line}`).join("\n");
}

function formatTasksInProgress(actionItems: string[]): string {
  if (actionItems.length === 0) {
    return "(none)";
  }
  return actionItems.map((t) => formatIncompleteTaskLine(t)).filter(Boolean).join("\n");
}

function formatTasksCompleted(completedTasks: string[]): string {
  if (completedTasks.length === 0) {
    return "(none)";
  }
  return completedTasks.map((t) => formatCompletedTaskLine(t)).filter(Boolean).join("\n");
}

function normalizeSuggestionLine(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function formatProjectStatusLabel(status: string | undefined): string {
  const normalized = (status || "active").trim().toLowerCase();
  switch (normalized) {
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "active":
    default:
      return "Active";
  }
}

function formatPendingSuggestions(payload: ProjectEmailPayload): string {
  const pending = payload.pendingSuggestions
    .filter((s) => s.status === "pending")
    .map((s) => ({
      id: s.id.trim(),
      content: normalizeSuggestionLine(s.content),
    }))
    .filter((s) => s.id || s.content);

  if (pending.length === 0) {
    return "(none)";
  }

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const suggestion of pending) {
    const key = `${suggestion.id.toLowerCase()}|${suggestion.content.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (suggestion.id && suggestion.content) {
      lines.push(`- [${suggestion.id}] ${suggestion.content}`);
    } else if (suggestion.id) {
      lines.push(`- [${suggestion.id}]`);
    } else {
      lines.push(`- ${suggestion.content}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "(none)";
}

export function generateProjectDocument(payload: ProjectEmailPayload): string {
  const { context } = payload;
  const overview = compactOverviewForDocument(context.summary) || "(No overview yet.)";
  const projectName = (context.projectName || "").trim() || "Untitled Project";
  const projectStatus = formatProjectStatusLabel(context.projectStatus);

  const goalsBlock = formatBulletSection(context.goals, "(none)");
  const decisionsBlock = formatBulletSection(context.decisions, "(none)");
  const risksBlock = formatBulletSection(context.risks, "(none)");
  const notesBlock = formatBulletSection(context.notes, "(none)");

  const tasksIncomplete = formatTasksInProgress(context.actionItems);
  const tasksCompleted = formatTasksCompleted(context.completedTasks);

  const recentBlock =
    context.recentUpdatesLog.length > 0
      ? context.recentUpdatesLog.map((line) => `- ${line}`).join("\n")
      : "(none)";
  const pendingSuggestionsBlock = formatPendingSuggestions(payload);

  return [
    "# PROJECT FILE",
    "",
    "## Project Metadata",
    "",
    "Project Name:",
    `- ${projectName}`,
    "",
    "---",
    "",
    "## Instructions to LLM",
    "",
    LLM_INSTRUCTIONS,
    "",
    "## Project Overview",
    "",
    overview,
    "",
    "---",
    "",
    "## Goals",
    "",
    goalsBlock,
    "",
    "---",
    "",
    "## Tasks",
    "",
    "### In Progress",
    "",
    tasksIncomplete,
    "",
    "### Completed",
    "",
    tasksCompleted,
    "",
    "---",
    "",
    "## Risks",
    "",
    risksBlock,
    "",
    "---",
    "",
    "## Decisions",
    "",
    decisionsBlock,
    "",
    "Project Status:",
    `- ${projectStatus}`,
    "",
    "---",
    "",
    "## Notes",
    "",
    notesBlock,
    "",
    "---",
    "",
    "## Recent Updates",
    "",
    recentBlock,
    "",
    "---",
    "",
    "## Pending Suggestions",
    "",
    pendingSuggestionsBlock,
    "",
  ].join("\n");
}
