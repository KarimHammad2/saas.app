import { getProjectDocumentMode } from "@/lib/env";
import type { ProjectEmailPayload } from "@/modules/output/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

const EMPTY_OVERVIEW_TEXT = "(No overview yet)";
const EMPTY_STATUS_TEXT = "(No status yet)";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatListOrPlaceholder(values: string[], emptyPlaceholder: string): string {
  if (values.length === 0) {
    return `<p>${escapeHtml(emptyPlaceholder)}</p>`;
  }

  const listItems = values.map((item) => `    <li>${escapeHtml(item)}</li>`).join("\n");
  return `  <ul>\n${listItems}\n  </ul>`;
}

function formatPendingSuggestions(payload: ProjectEmailPayload): string {
  const items = payload.pendingSuggestions
    .map((s) => `    <li>${escapeHtml(`${s.content} (${s.status})`)}</li>`)
    .join("\n");
  return `  <ul>\n${items}\n  </ul>`;
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
      const split90 = total * 0.9;
      const split10 = total * 0.1;
      const line = `Total: ${formatCurrency(total)} · Freelancer (90%): ${formatCurrency(split90)} · Platform (10%): ${formatCurrency(split10)}`;
      return `    <li>${escapeHtml(line)}</li>`;
    })
    .join("\n");
  return `  <ul>\n${items}\n  </ul>`;
}

export function formatProjectEmail(payload: ProjectEmailPayload): string {
  const { context } = payload;
  const overview = compactOverviewForDocument(context.summary) || EMPTY_OVERVIEW_TEXT;

  if (getProjectDocumentMode() === "minimal") {
    const sections = [
      "<h1>Overview</h1>",
      `<p>${escapeHtml(overview)}</p>`,
      "<h1>Goals</h1>",
      formatListOrPlaceholder(context.goals, "(No goals yet)"),
      "<h1>Tasks</h1>",
      formatListOrPlaceholder(context.actionItems, "(No tasks yet)"),
      "<h1>Risks</h1>",
      formatListOrPlaceholder(context.risks, "(No risks yet)"),
      "<h1>Notes</h1>",
      formatListOrPlaceholder(context.notes, "(No notes yet)"),
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
    "<h2>Status</h2>",
    `<p>${escapeHtml(statusLine)}</p>`,
    "<h2>Goals</h2>",
    formatListOrPlaceholder(context.goals, "(No goals yet)"),
    "<h2>Tasks</h2>",
    formatListOrPlaceholder(context.actionItems, "(No tasks yet)"),
    "<h2>Decisions</h2>",
    formatListOrPlaceholder(context.decisions, "(No decisions yet)"),
    "<h2>Risks</h2>",
    formatListOrPlaceholder(context.risks, "(No risks yet)"),
    "<h2>Recommendations</h2>",
    formatListOrPlaceholder(context.recommendations, "(No recommendations yet)"),
    "<h2>Notes</h2>",
    formatListOrPlaceholder(context.notes, "(No notes yet)"),
    "<h2>Next steps</h2>",
    formatNextSteps(payload),
    "<h2>Account</h2>",
    `<p>${escapeHtml(`Tier: ${context.tier} · Reminder balance: ${context.reminderBalance} · Usage count: ${context.usageCount}`)}</p>`,
  ];

  if (payload.pendingSuggestions.length > 0) {
    sections.splice(sections.length - 4, 0, "<h2>Pending Suggestions</h2>", formatPendingSuggestions(payload));
  }
  if (payload.context.transactionHistory.length > 0) {
    sections.splice(sections.length - 4, 0, "<h2>Transactions</h2>", formatTransactions(payload));
  }

  return sections.join("\n");
}
