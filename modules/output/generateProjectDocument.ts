import type { ProjectContext, TransactionRecord, UserProfileContext } from "@/modules/contracts/types";
import { formatMoneyAmountForEmail } from "@/modules/output/checkoutCurrencyDisplay";
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

**Optional structured blocks** (parsed from labeled sections — use these exact headings):

 - \`Project Name:\` then a bullet line with the exact title when they want a specific project name. If they skip this, the system may still derive a short name from the new scope sentence.
 - \`Goals:\`, \`Tasks:\`, \`Completed:\`, \`Decisions:\`, \`Risks:\`, \`Notes:\` — same rules as elsewhere; only include sections that changed.

### Hiring and Pricing Logic

When the project requires execution work (e.g. development, design, marketing execution), you should:

 - Identify when external help (freelancer or contractor) is needed
 - Suggest hiring clearly and explain why it is needed
 - Estimate:
   - number of hours required
   - reasonable hourly rate (based on context)
 - Present a clear proposal to the user

When proposing work, always include:

 - Hours estimate
 - Hourly rate
 - Total cost
 - Allocation breakdown using the SaaS² model:
   - 90% allocated to the freelancer
   - 10% retained as buffer
     - SaaS² fee
     - project remainder

Example format:

Transaction Proposal:
 - Hours: X
 - Hourly Rate: Y
 - Total: X * Y
 - Allocated to Freelancer: 90%
 - Buffer: 10% (split into fee + remainder)

Important rules:

 - NEVER assume the transaction is approved
 - ALWAYS ask the user for confirmation before proceeding
 - Use phrasing like:
   "Would you like to proceed with this?"
 - NEVER say the transaction is completed
 - NEVER simulate payment

After approval:

 - Generate a structured Transaction block that the user can send to Frank via email

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

function formatAgencyRpmMetadataLines(context: ProjectContext): string[] {
  if (context.planPackage !== "agency" || !context.featureFlags?.oversight) {
    return [];
  }
  const rpm = context.activeRpmEmail?.trim();
  if (rpm) {
    return ["Assigned RPM:", `- ${rpm}`, ""];
  }
  return [
    "Assign RPM:",
    "(Put the email of the RPM you want assigned to this project. Reply using the same block format: `Assign RPM:` on one line, then the address on the next line.)",
    "",
  ];
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

function formatDateOnly(iso: string | undefined): string {
  if (!iso) {
    return "(none)";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "(none)";
  }
  return parsed.toISOString().slice(0, 10);
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

function roundDisplayNumber(n: number): string {
  const x = Math.round(n * 100) / 100;
  if (Number.isInteger(x)) {
    return String(x);
  }
  return String(x);
}

/** "1 hour" vs "1.5 hours" for remainder-style amounts. */
function formatHourWordLabel(n: number): string {
  const r = roundDisplayNumber(n);
  const abs = Math.abs(Number(r));
  const word = abs === 1 ? "hour" : "hours";
  return `${r} ${word}`;
}

function paymentStatusSuffix(tx: TransactionRecord): string {
  if (tx.paymentStatus === "paid") {
    return " (Paid)";
  }
  if (tx.paymentStatus === "pending_payment") {
    return " (Pending payment)";
  }
  return " (Cancelled)";
}

function remainderDeltaNoun(absVal: number): "hour" | "hours" {
  if (absVal === 1 || (absVal > 0 && absVal < 1)) {
    return "hour";
  }
  return "hours";
}

function formatRemainderContributionArrow(projectRemainder: number): string {
  if (projectRemainder === 0) {
    return "→ Remainder +0 hours";
  }
  const absVal = Math.abs(projectRemainder);
  const amount = roundDisplayNumber(absVal);
  const noun = remainderDeltaNoun(absVal);
  if (projectRemainder > 0) {
    return `→ Remainder +${amount} ${noun}`;
  }
  return `→ Remainder ${roundDisplayNumber(projectRemainder)} ${noun}`;
}

function formatHourPurchaseHistoryLine(tx: TransactionRecord): string {
  const hoursPart = formatHourWordLabel(tx.hoursPurchased);
  const rateWithUnit = `${formatMoneyAmountForEmail(tx.hourlyRate, tx.paymentCurrency)}/hour`;
  const arrow = formatRemainderContributionArrow(tx.projectRemainder);
  return `- ${hoursPart} at ${rateWithUnit} ${arrow}${paymentStatusSuffix(tx)}`;
}

function formatOtherTransactionHistoryLine(tx: TransactionRecord): string {
  if (tx.type === "allocation") {
    return `- Allocation recorded${paymentStatusSuffix(tx)}`;
  }
  return `- Remainder adjustment (${roundDisplayNumber(tx.projectRemainder)} h)${paymentStatusSuffix(tx)}`;
}

function formatTransactionHistoryMarkdown(transactions: TransactionRecord[]): string {
  if (transactions.length === 0) {
    return "- (No purchases in history yet.)";
  }
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const lines = sorted.map((tx) =>
    tx.type === "hourPurchase" ? formatHourPurchaseHistoryLine(tx) : formatOtherTransactionHistoryLine(tx),
  );
  return lines.join("\n");
}

/** Included in the LLM project file when there is remainder or any stored transactions. */
function formatFinancialSummarySection(context: ProjectContext): string | null {
  if (context.transactionHistory.length === 0 && context.remainderBalance === 0) {
    return null;
  }
  const body = [
    "## Financial Summary",
    "",
    `Remainder Balance: ${formatHourWordLabel(context.remainderBalance)}`,
    "",
    "### Transaction History",
    "",
    formatTransactionHistoryMarkdown(context.transactionHistory),
    "",
  ].join("\n");
  return body;
}

export function generateProjectDocument(payload: ProjectEmailPayload): string {
  const { context, userProfile } = payload;
  const summarySource = context.summary || context.initialSummary;
  const overviewSource = context.summary || "";
  const summary = compactOverviewForDocument(summarySource) || "(No summary yet.)";
  const overview = compactOverviewForDocument(overviewSource) || "(No overview yet.)";
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

  const agencyRpmLines = formatAgencyRpmMetadataLines(context);
  const financialSummarySection = formatFinancialSummarySection(context);

  return [
    "# PROJECT FILE",
    "",
    "## Project Metadata",
    "",
    "Project Name:",
    `- ${projectName}`,
    "Last Contact:",
    `- ${formatDateOnly(context.lastContactAt)}`,
    "",
    ...agencyRpmLines,
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
    "## Summary",
    "",
    summary,
    "",
    "---",
    "",
    "## Project Overview",
    "",
    overview,
    "",
    ...(financialSummarySection ? [financialSummarySection, "---", ""] : ["---", ""]),
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
