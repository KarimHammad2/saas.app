import type { ProjectEmailPayload } from "@/modules/output/types";

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
  return [
    "# Project Update",
    "",
    "## Overview",
    "",
    context.summary || "(No overview yet)",
    "",
    "## Goals",
    "",
    formatBulletList(context.goals, "(No goals yet)"),
    "",
    "## Tasks",
    "",
    formatBulletList(context.actionItems, "(No tasks yet)"),
    "",
    "## Risks",
    "",
    formatBulletList(context.risks, "(No risks yet)"),
    "",
    "## Notes",
    "",
    formatBulletList(context.notes, "(No notes yet)"),
    "",
  ].join("\n");
}
