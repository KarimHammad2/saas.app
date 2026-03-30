import { getProjectDocumentMode } from "@/lib/env";
import type { ProjectEmailPayload } from "@/modules/output/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}

function formatBulletList(values: string[], emptyPlaceholder: string): string {
  const uniqueValues = dedupePreserveOrder(values);
  if (uniqueValues.length === 0) {
    // Keep the document "paste into ChatGPT" friendly: placeholders are plain text,
    // not bullet rows like "- None".
    return emptyPlaceholder;
  }
  return uniqueValues.map((line) => `- ${line}`).join("\n");
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatTransactions(payload: ProjectEmailPayload): string | null {
  if (payload.context.transactionHistory.length === 0) {
    return null;
  }

  const lines = payload.context.transactionHistory.map((tx) => {
    const total = tx.hoursPurchased * tx.hourlyRate;
    const platformShare = Math.max(0, tx.saas2Fee);
    const userShare = Math.max(0, total - platformShare);
    return [
      `- Transaction ${tx.id}:`,
      `  - Hours: ${tx.hoursPurchased}`,
      `  - Rate: ${formatCurrency(tx.hourlyRate)}`,
      `  - Total: ${formatCurrency(total)}`,
      `  - User share: ${formatCurrency(userShare)}`,
      `  - Platform share: ${formatCurrency(platformShare)}`,
    ].join("\n");
  });

  return lines.join("\n");
}

export function generateProjectDocument(payload: ProjectEmailPayload): string {
  const { context } = payload;
  const overview = compactOverviewForDocument(context.summary) || "(No overview yet)";
  const hasPendingSuggestions = payload.pendingSuggestions.length > 0;
  const pendingLines = hasPendingSuggestions
    ? dedupePreserveOrder(payload.pendingSuggestions.map((s) => `[${s.status.toUpperCase()} ${s.id}] ${s.content}`))
        .map((line) => `- ${line}`)
        .join("\n")
    : null;
  const transactionSection = formatTransactions(payload);

  if (getProjectDocumentMode() === "minimal") {
    const base = [
      "# Overview",
      "",
      overview,
      "",
      "# Goals",
      "",
      formatBulletList(context.goals, "(No goals yet)"),
      "",
      "# Tasks",
      "",
      formatBulletList(context.actionItems, "(No tasks yet)"),
      "",
      "# Risks",
      "",
      formatBulletList(context.risks, "(No risks yet)"),
      "",
      "# Notes",
      "",
      formatBulletList(context.notes, "(No notes yet)"),
      "",
    ];

    if (pendingLines) {
      base.push("# Pending Suggestions", "", pendingLines, "");
    }
    if (transactionSection) {
      base.push("# Transactions", "", transactionSection, "");
    }

    return base.join("\n");
  }

  const statusLine = context.currentStatus?.trim() || "(No status yet)";
  const nextLines =
    payload.nextSteps.length === 0 ? "(No next steps)" : payload.nextSteps.map((s) => `- ${s}`).join("\n");
  const rows = [
    "# Project Update",
    "",
    "## Overview",
    "",
    overview,
    "",
    "## Status",
    "",
    statusLine,
    "",
    "## Goals",
    "",
    formatBulletList(context.goals, "(No goals yet)"),
    "",
    "## Tasks",
    "",
    formatBulletList(context.actionItems, "(No tasks yet)"),
    "",
    "## Decisions",
    "",
    formatBulletList(context.decisions, "(No decisions yet)"),
    "",
    "## Risks",
    "",
    formatBulletList(context.risks, "(No risks yet)"),
    "",
    "## Recommendations",
    "",
    formatBulletList(context.recommendations, "(No recommendations yet)"),
    "",
    "## Notes",
    "",
    formatBulletList(context.notes, "(No notes yet)"),
    "",
    "## Next steps",
    "",
    nextLines,
    "",
  ];

  if (pendingLines) {
    rows.push("## Pending Suggestions", "", pendingLines, "");
  }

  if (transactionSection) {
    rows.push("## Transactions", "", transactionSection, "");
  }

  rows.push(
    "## Account",
    "",
    `- Tier: ${context.tier}`,
    `- Reminder balance: ${context.reminderBalance}`,
    `- Usage count: ${context.usageCount}`,
    "",
  );

  return rows.join("\n");
}
