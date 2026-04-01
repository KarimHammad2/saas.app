import { getProjectDocumentMode } from "@/lib/env";
import type { ProjectEmailPayload } from "@/modules/output/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";
import {
  buildKickoffNextSteps,
  computeProjectProgress,
  dedupePreserveOrder,
  getGuidedEmptyPlaceholder,
  toHumanSuggestions,
} from "@/modules/output/presentationHelpers";

const EMPTY_OVERVIEW_TEXT = "(No overview yet)";
const EMPTY_STATUS_TEXT = '(No status yet - reply with "Status:" to define where things stand.)';

function isKickoffPayload(payload: ProjectEmailPayload): boolean {
  if (payload.emailKind) {
    return payload.emailKind === "kickoff";
  }
  return payload.isWelcome;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatListOrPlaceholder(values: string[], emptyPlaceholder: string): string {
  const uniqueValues = dedupePreserveOrder(values);
  if (uniqueValues.length === 0) {
    return `<p>${escapeHtml(emptyPlaceholder)}</p>`;
  }

  const listItems = uniqueValues.map((item) => `    <li>${escapeHtml(item)}</li>`).join("\n");
  return `  <ul>\n${listItems}\n  </ul>`;
}

function formatPendingSuggestions(payload: ProjectEmailPayload): string {
  const items = toHumanSuggestions(payload.pendingSuggestions)
    .map((line) => `    <li>${escapeHtml(line)}</li>`)
    .join("\n");
  return [`<p>${escapeHtml("Here are a few things to think about next:")}</p>`, `  <ul>\n${items}\n  </ul>`].join("\n");
}

function formatNextSteps(payload: ProjectEmailPayload): string {
  if (payload.nextSteps.length === 0) {
    return `<p>${escapeHtml("(No next steps)")}</p>`;
  }
  const items = payload.nextSteps.map((s) => `    <li>${escapeHtml(s)}</li>`).join("\n");
  return `  <ul>\n${items}\n  </ul>`;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatTransactions(payload: ProjectEmailPayload): string {
  const items = payload.context.transactionHistory
    .map((tx) => {
      const total = tx.hoursPurchased * tx.hourlyRate;
      const platformShare = Math.max(0, tx.saas2Fee);
      const userShare = Math.max(0, total - platformShare);
      const line = `Total: ${formatCurrency(total)} · User share: ${formatCurrency(userShare)} · Platform share: ${formatCurrency(platformShare)}`;
      return `    <li>${escapeHtml(line)}</li>`;
    })
    .join("\n");
  return `  <ul>\n${items}\n  </ul>`;
}

function formatProgressBlock(progress: { projectStatus: string; completeness: number; nextStep: string }): string {
  return [
    "  <ul>",
    `    <li><strong>Project Status:</strong> ${escapeHtml(progress.projectStatus)}</li>`,
    `    <li><strong>Completeness:</strong> ${escapeHtml(`${progress.completeness}%`)}</li>`,
    `    <li><strong>Next Step:</strong> ${escapeHtml(progress.nextStep)}</li>`,
    "  </ul>",
  ].join("\n");
}

function formatIdentityBlock(payload: ProjectEmailPayload): string {
  const lines: string[] = [];
  if (payload.context.projectName) {
    lines.push(`<strong>Project:</strong> ${escapeHtml(payload.context.projectName)}`);
  }
  const ownerLabel =
    payload.context.ownerDisplayName && payload.context.ownerEmail
      ? `${payload.context.ownerDisplayName} <${payload.context.ownerEmail}>`
      : payload.context.ownerDisplayName || payload.context.ownerEmail || "";
  if (ownerLabel) {
    lines.push(`<strong>Owner:</strong> ${escapeHtml(ownerLabel)}`);
  }
  if (lines.length === 0) {
    return "";
  }
  return `<p>${lines.join(" · ")}</p>`;
}

export function formatProjectEmail(payload: ProjectEmailPayload): string {
  const { context } = payload;
  const overview = compactOverviewForDocument(context.summary) || EMPTY_OVERVIEW_TEXT;
  const progress = computeProjectProgress(context);
  const isKickoff = isKickoffPayload(payload);

  if (getProjectDocumentMode() === "minimal") {
    if (isKickoff) {
      const kickoffSteps = buildKickoffNextSteps(payload.context);
      const kickoffStepItems = kickoffSteps.map((s) => `    <li>${escapeHtml(s)}</li>`).join("\n");
      const identityBlock = formatIdentityBlock(payload);

      return [
        "<h1>Overview</h1>",
        `<p>${escapeHtml(overview)}</p>`,
        identityBlock,
        "<h1>Next Steps</h1>",
        `  <ul>\n${kickoffStepItems}\n  </ul>`,
        "<h1>Goals</h1>",
        formatListOrPlaceholder(context.goals.slice(0, 3), getGuidedEmptyPlaceholder("goals", context)),
        "<h1>Tasks</h1>",
        formatListOrPlaceholder(context.actionItems.slice(0, 3), getGuidedEmptyPlaceholder("tasks", context)),
        "<h1>Risks</h1>",
        formatListOrPlaceholder(context.risks.slice(0, 3), getGuidedEmptyPlaceholder("risks", context)),
        "<h1>Decisions</h1>",
        formatListOrPlaceholder(context.decisions.slice(0, 3), getGuidedEmptyPlaceholder("decisions", context)),
        "<h1>Notes</h1>",
        formatListOrPlaceholder(context.notes.slice(0, 3), getGuidedEmptyPlaceholder("notes", context)),
      ].join("\n");
    }

    const sections = [
      "<h1>Overview</h1>",
      `<p>${escapeHtml(overview)}</p>`,
      "<h1>Project Progress</h1>",
      formatProgressBlock(progress),
      "<h1>Goals</h1>",
      formatListOrPlaceholder(context.goals, getGuidedEmptyPlaceholder("goals", context)),
      "<h1>Tasks</h1>",
      formatListOrPlaceholder(context.actionItems, getGuidedEmptyPlaceholder("tasks", context)),
      "<h1>Risks</h1>",
      formatListOrPlaceholder(context.risks, getGuidedEmptyPlaceholder("risks", context)),
      "<h1>Decisions</h1>",
      formatListOrPlaceholder(context.decisions, getGuidedEmptyPlaceholder("decisions", context)),
      "<h1>Notes</h1>",
      formatListOrPlaceholder(context.notes, getGuidedEmptyPlaceholder("notes", context)),
    ];

    if (payload.pendingSuggestions.length > 0) {
      sections.push("<h1>Pending Suggestions</h1>", formatPendingSuggestions(payload));
    }
    if (payload.context.transactionHistory.length > 0) {
      sections.push("<h1>Transactions</h1>", formatTransactions(payload));
    }

    return sections.join("\n");
  }

  const statusLine = context.currentStatus?.trim() || EMPTY_STATUS_TEXT;

  const sections = [
    "<h2>Overview</h2>",
    `<p>${escapeHtml(overview)}</p>`,
    "<h2>Project Progress</h2>",
    formatProgressBlock(progress),
    "<h2>Status</h2>",
    `<p>${escapeHtml(statusLine)}</p>`,
    "<h2>Goals</h2>",
    formatListOrPlaceholder(context.goals, getGuidedEmptyPlaceholder("goals", context)),
    "<h2>Tasks</h2>",
    formatListOrPlaceholder(context.actionItems, getGuidedEmptyPlaceholder("tasks", context)),
    "<h2>Decisions</h2>",
    formatListOrPlaceholder(context.decisions, getGuidedEmptyPlaceholder("decisions", context)),
    "<h2>Risks</h2>",
    formatListOrPlaceholder(context.risks, getGuidedEmptyPlaceholder("risks", context)),
    "<h2>Recommendations</h2>",
    formatListOrPlaceholder(context.recommendations, getGuidedEmptyPlaceholder("recommendations", context)),
    "<h2>Notes</h2>",
    formatListOrPlaceholder(context.notes, getGuidedEmptyPlaceholder("notes", context)),
    "<h2>Next steps</h2>",
    formatNextSteps(payload),
    "<h2>Account</h2>",
    `<p>${escapeHtml(`Tier: ${context.tier} · Reminder balance: ${context.reminderBalance} · Usage count: ${context.usageCount}`)}</p>`,
  ];

  if (payload.pendingSuggestions.length > 0 && !isKickoff) {
    sections.splice(sections.length - 4, 0, "<h2>Pending Suggestions</h2>", formatPendingSuggestions(payload));
  }
  if (payload.context.transactionHistory.length > 0) {
    sections.splice(sections.length - 4, 0, "<h2>Transactions</h2>", formatTransactions(payload));
  }

  return sections.join("\n");
}
