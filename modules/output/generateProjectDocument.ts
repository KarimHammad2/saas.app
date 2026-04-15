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
- Use bullet points instead of long paragraphs
- Avoid unnecessary explanations
- Focus on helping progress

---

## How to generate updates for the system

When suggesting updates that the user may send via email:

You MUST follow this exact structure:

Project Name:
- ...

Goals:
- ...

Tasks:
- ...

Completed:
- ...

Risks:
- ...

Decisions:
- ...

Project Status:
- active

Notes:
- ...

Rules:
- Only include sections that have updates
- Do NOT rewrite the full project
- Do NOT include explanations outside sections
- Do NOT invent new section names
- Use only these status values when updating Project Status: active, paused, completed
- Keep updates concise and structured

---

## Example

User input:
"Auth is done"

Correct output:

Completed:
- Build authentication system`;

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
