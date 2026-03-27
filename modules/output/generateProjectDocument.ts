import { getProjectDocumentMode } from "@/lib/env";
import type { ProjectEmailPayload } from "@/modules/output/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

function formatBulletList(values: string[], emptyPlaceholder: string): string {
  if (values.length === 0) {
    // Keep the document "paste into ChatGPT" friendly: placeholders are plain text,
    // not bullet rows like "- None".
    return emptyPlaceholder;
  }
  return values.map((line) => `- ${line}`).join("\n");
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
    const split90 = total * 0.9;
    const split10 = total * 0.1;
    return [
      `- Transaction ${tx.id}:`,
      `  - Hours: ${tx.hoursPurchased}`,
      `  - Rate: ${formatCurrency(tx.hourlyRate)}`,
      `  - Total: ${formatCurrency(total)}`,
      `  - Freelancer (90%): ${formatCurrency(split90)}`,
      `  - Platform (10%): ${formatCurrency(split10)}`,
    ].join("\n");
  });

  return lines.join("\n");
}

export function generateProjectDocument(payload: ProjectEmailPayload): string {
  const { context } = payload;
  const overview = compactOverviewForDocument(context.summary) || "(No overview yet)";
  const hasPendingSuggestions = payload.pendingSuggestions.length > 0;
  const pendingLines = hasPendingSuggestions
    ? payload.pendingSuggestions.map((s) => `- ${s.content} (${s.status})`).join("\n")
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
