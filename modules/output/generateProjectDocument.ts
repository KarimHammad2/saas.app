import type { UserProfileContext } from "@/modules/contracts/types";
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

### Project direction changes (pivot / new focus)

When the user changes what they are building or their main focus (for example from a landing page to marketing, or from one product idea to another), the orchestration layer detects that from **natural language in the email body** (the same text the user sends to Frank), not from the LLM chat. Labeled sections alone are not enough for that detection unless they also write a clear pivot sentence in the body.

**Phrasing that is reliably detected** — include at least one of these ideas in a short sentence or two, and name both the old direction and the new one where possible:

 - Words like **instead**, **rather than**, **switching to**, **pivot** / **pivoting**, **changing direction**
 - Sentences like **We are no longer …** followed by what they want **now** or **instead** (for example: *We are no longer building X, now we want Y* or *Instead we want …*)

Put that pivot language in the **opening lines** of the message they will email to Frank (before or after structured blocks). A vague update without pivot cues may update goals or notes but **not** refresh the stored project overview or project name the same way.

**Optional structured blocks** (parsed from labeled sections — use these exact headings):

 - \`Project Name:\` then a bullet line with the exact title when they want a specific project name. If they skip this, the system may still derive a short name from the new scope sentence.
 - \`Goals:\`, \`Tasks:\`, \`Completed:\`, \`Decisions:\`, \`Risks:\`, \`Notes:\` — same rules as elsewhere; only include sections that changed.

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

function appendRecordBullets(label: string, rec: Record<string, unknown>, lines: string[]): number {
  let added = 0;
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined || v === null) {
      continue;
    }
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (!s.trim()) {
      continue;
    }
    lines.push(`- ${label}${k}: ${s}`);
    added += 1;
  }
  return added;
}

function formatUserProfileContextSection(profile: UserProfileContext): string {
  const lines: string[] = [];
  let extras = 0;
  const cs = profile.communicationStyle;
  if (cs.tone) {
    lines.push(`- Tone: ${cs.tone}`);
    extras += 1;
  }
  if (cs.format) {
    lines.push(`- Format: ${cs.format}`);
    extras += 1;
  }
  if (cs.verbosity) {
    lines.push(`- Verbosity: ${cs.verbosity}`);
    extras += 1;
  }

  extras += appendRecordBullets("Preference ", profile.preferences, lines);
  extras += appendRecordBullets("Constraint ", profile.constraints, lines);
  extras += appendRecordBullets("Onboarding ", profile.onboardingData, lines);
  extras += appendRecordBullets("Behavior ", profile.behaviorModifiers, lines);

  const sow = profile.structuredContext;
  if (sow.role) {
    lines.push(`- Role: ${sow.role}`);
    extras += 1;
  }
  if (sow.business) {
    lines.push(`- Business: ${sow.business}`);
    extras += 1;
  }

  for (const block of profile.longTermInstructions) {
    const t = block.trim();
    if (t) {
      lines.push(`- ${t}`);
      extras += 1;
    }
  }

  if (extras === 0) {
    lines.push("- (No additional user preferences recorded yet.)");
  }

  return lines.join("\n");
}

export function generateProjectDocument(payload: ProjectEmailPayload): string {
  const { context, userProfile } = payload;
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
  const userProfileBlock = formatUserProfileContextSection(userProfile);

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
    "## User Profile Context",
    "",
    "Global memory about the user (not project data). It stays minimal until they send preferences (e.g. a UserProfile: block) or we infer details from their messages.",
    "",
    userProfileBlock,
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
