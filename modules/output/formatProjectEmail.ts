import type { ProjectEmailPayload } from "@/modules/output/types";

const EMPTY_OVERVIEW_TEXT = "(No overview yet)";

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

export function formatProjectEmail(payload: ProjectEmailPayload): string {
  const { context } = payload;
  return [
    "<h1>Project Update</h1>",
    "<h2>Overview</h2>",
    `<p>${escapeHtml(context.summary || EMPTY_OVERVIEW_TEXT)}</p>`,
    "<h2>Goals</h2>",
    formatListOrPlaceholder(context.goals, "(No goals yet)"),
    "<h2>Tasks</h2>",
    formatListOrPlaceholder(context.actionItems, "(No tasks yet)"),
    "<h2>Risks</h2>",
    formatListOrPlaceholder(context.risks, "(No risks yet)"),
    "<h2>Notes</h2>",
    formatListOrPlaceholder(context.notes, "(No notes yet)"),
  ].join("\n");
}
