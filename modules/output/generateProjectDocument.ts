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
  const statusLine = context.currentStatus?.trim() || "(No status yet)";

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
  ].join("\n");
}
