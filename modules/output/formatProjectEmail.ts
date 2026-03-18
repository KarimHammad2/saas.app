import type { ProjectEmailPayload } from "@/modules/output/types";

const EMPTY_SUMMARY_TEXT = "No summary yet.";
const EMPTY_SECTION_ITEM = "None";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatList(values: string[]): string {
  const items = values.length > 0 ? values : [EMPTY_SECTION_ITEM];
  const listItems = items.map((item) => `    <li>${escapeHtml(item)}</li>`).join("\n");

  return `  <ul>\n${listItems}\n  </ul>`;
}

function formatSuggestions(items: ProjectEmailPayload["pendingSuggestions"]): string {
  if (items.length === 0) {
    return "<p>No pending RPM suggestions.</p>";
  }

  const listItems = items
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.id)}</strong> from ${escapeHtml(item.fromEmail)}<br/>${escapeHtml(item.content)}</li>`,
    )
    .join("\n");
  return `<ul>\n${listItems}\n</ul>`;
}

export function formatProjectEmail(payload: ProjectEmailPayload): string {
  const { context, pendingSuggestions, nextSteps } = payload;
  return [
    "<h1>Project Update</h1>",
    "<h2>Summary</h2>",
    `<p>${escapeHtml(context.summary || EMPTY_SUMMARY_TEXT)}</p>`,
    "<h2>Goals</h2>",
    formatList(context.goals),
    "<h2>Action Items</h2>",
    formatList(context.actionItems),
    "<h2>Decisions</h2>",
    formatList(context.decisions),
    "<h2>Risks</h2>",
    formatList(context.risks),
    "<h2>Recommendations</h2>",
    formatList(context.recommendations),
    "<h2>Pending RPM Suggestions</h2>",
    formatSuggestions(pendingSuggestions),
    "<h2>Remainder Balance</h2>",
    `<p>${escapeHtml(context.remainderBalance.toFixed(2))}</p>`,
    "<h2>Next Steps</h2>",
    formatList(nextSteps),
  ].join("\n");
}
