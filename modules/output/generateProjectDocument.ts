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

export function generateProjectDocument(payload: ProjectEmailPayload): string {
  const { context } = payload;
  const overview = compactOverviewForDocument(context.summary) || "(No overview yet)";

  if (getProjectDocumentMode() === "minimal") {
    return [
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
    ].join("\n");
  }

  const statusLine = context.currentStatus?.trim() || "(No status yet)";
  const pendingLines =
    payload.pendingSuggestions.length === 0
      ? "(No pending RPM suggestions)"
      : payload.pendingSuggestions.map((s) => `- ${s.content}`).join("\n");
  const nextLines =
    payload.nextSteps.length === 0 ? "(No next steps)" : payload.nextSteps.map((s) => `- ${s}`).join("\n");

  return [
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
    "## RPM suggestions (pending)",
    "",
    pendingLines,
    "",
    "## Next steps",
    "",
    nextLines,
    "",
    "## Account",
    "",
    `- Tier: ${context.tier}`,
    `- Reminder balance: ${context.reminderBalance}`,
    `- Usage count: ${context.usageCount}`,
    "",
  ].join("\n");
}
