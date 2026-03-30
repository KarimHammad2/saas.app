import { getProjectDocumentMode } from "@/lib/env";
import type { ProjectEmailPayload } from "@/modules/output/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";
import {
  computeProjectProgress,
  dedupePreserveOrder,
  getGuidedEmptyPlaceholder,
  toHumanSuggestions,
} from "@/modules/output/presentationHelpers";

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
  const progress = computeProjectProgress(context);
  const hasPendingSuggestions = payload.pendingSuggestions.length > 0;
  const pendingLines = hasPendingSuggestions
    ? toHumanSuggestions(payload.pendingSuggestions)
        .map((line, index) => `${index + 1}. ${line.label}\n   -> ${line.content}`)
        .join("\n")
    : null;
  const transactionSection = formatTransactions(payload);

  if (getProjectDocumentMode() === "minimal") {
    const base = [
      "# Overview",
      "",
      overview,
      "",
      "# Project Progress",
      "",
      `- Project Status: ${progress.projectStatus}`,
      `- Completeness: ${progress.completeness}%`,
      `- Next Step: ${progress.nextStep}`,
      "",
      "# Goals",
      "",
      formatBulletList(context.goals, getGuidedEmptyPlaceholder("goals")),
      "",
      "# Tasks",
      "",
      formatBulletList(context.actionItems, getGuidedEmptyPlaceholder("tasks")),
      "",
      "# Risks",
      "",
      formatBulletList(context.risks, getGuidedEmptyPlaceholder("risks")),
      "",
      "# Notes",
      "",
      formatBulletList(context.notes, getGuidedEmptyPlaceholder("notes")),
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

  const statusLine = context.currentStatus?.trim() || '(No status yet - reply with "Status:" to define where things stand.)';
  const nextLines =
    payload.nextSteps.length === 0 ? "(No next steps)" : payload.nextSteps.map((s) => `- ${s}`).join("\n");
  const rows = [
    "# Project Update",
    "",
    "## Overview",
    "",
    overview,
    "",
    "## Project Progress",
    "",
    `- Project Status: ${progress.projectStatus}`,
    `- Completeness: ${progress.completeness}%`,
    `- Next Step: ${progress.nextStep}`,
    "",
    "## Status",
    "",
    statusLine,
    "",
    "## Goals",
    "",
    formatBulletList(context.goals, getGuidedEmptyPlaceholder("goals")),
    "",
    "## Tasks",
    "",
    formatBulletList(context.actionItems, getGuidedEmptyPlaceholder("tasks")),
    "",
    "## Decisions",
    "",
    formatBulletList(context.decisions, getGuidedEmptyPlaceholder("decisions")),
    "",
    "## Risks",
    "",
    formatBulletList(context.risks, getGuidedEmptyPlaceholder("risks")),
    "",
    "## Recommendations",
    "",
    formatBulletList(context.recommendations, getGuidedEmptyPlaceholder("recommendations")),
    "",
    "## Notes",
    "",
    formatBulletList(context.notes, getGuidedEmptyPlaceholder("notes")),
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
