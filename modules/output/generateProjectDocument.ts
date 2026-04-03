import type { ProjectEmailPayload } from "@/modules/output/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";
import { dedupePreserveOrder } from "@/modules/output/presentationHelpers";
import { formatCompletedTaskLine, formatIncompleteTaskLine } from "@/modules/domain/taskLabels";

const LLM_INSTRUCTIONS = `You are assisting with this project.

Your role:
- Analyze project state
- Suggest next steps
- Help the user move forward
- Identify risks and improvements

When interacting with the user:
- Be clear and actionable
- Ask questions if needed
- Help generate structured updates to send back via email

---`;

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

export function generateProjectDocument(payload: ProjectEmailPayload): string {
  const { context } = payload;
  const overview = compactOverviewForDocument(context.summary) || "(No overview yet.)";

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

  return [
    "# PROJECT FILE",
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
  ].join("\n");
}
