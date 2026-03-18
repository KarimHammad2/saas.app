import type { ProjectEmailPayload } from "@/modules/output/types";

const EMPTY_SUMMARY_TEXT = "No summary yet.";
const EMPTY_SECTION_ITEM = "None";

function formatSection(title: string, values: string[]): string {
  const lines = values.length > 0 ? values : [EMPTY_SECTION_ITEM];
  const bullets = lines.map((line) => `- ${line}`).join("\n");
  return `${title}:\n${bullets}`;
}

function formatSuggestions(items: ProjectEmailPayload["pendingSuggestions"]): string {
  if (items.length === 0) {
    return "Pending RPM Suggestions:\n- None";
  }

  return ["Pending RPM Suggestions:", ...items.map((item) => `- ${item.id} (${item.fromEmail}): ${item.content}`)].join(
    "\n",
  );
}

function formatTransactions(payload: ProjectEmailPayload): string {
  if (payload.context.transactionHistory.length === 0) {
    return "Transaction History:\n- None";
  }

  return [
    "Transaction History:",
    ...payload.context.transactionHistory.map(
      (tx) =>
        `- ${tx.createdAt} | ${tx.type} | Hours: ${tx.hoursPurchased} | Rate: ${tx.hourlyRate} | Remainder: ${tx.projectRemainder}`,
    ),
  ].join("\n");
}

export function generateProjectDocument(payload: ProjectEmailPayload): string {
  const { context } = payload;
  return [
    "PROJECT DOCUMENT",
    "",
    "Summary:",
    context.summary || EMPTY_SUMMARY_TEXT,
    "",
    formatSection("Goals", context.goals),
    "",
    formatSection("Action Items", context.actionItems),
    "",
    formatSection("Decisions", context.decisions),
    "",
    formatSection("Risks", context.risks),
    "",
    formatSection("Recommendations", context.recommendations),
    "",
    formatSuggestions(payload.pendingSuggestions),
    "",
    `Remainder Balance:\n${context.remainderBalance.toFixed(2)}`,
    "",
    formatTransactions(payload),
    "",
    formatSection("Next Steps", payload.nextSteps),
  ].join("\n");
}
