import type { ProjectEmailPayload } from "@/modules/output/types";

const EMPTY_SECTION_ITEM = "None";

function formatBulletList(values: string[]): string {
  const lines = values.length > 0 ? values : [EMPTY_SECTION_ITEM];
  return lines.map((line) => `- ${line}`).join("\n");
}

export function generateProjectDocument(payload: ProjectEmailPayload): string {
  const { context } = payload;
  return [
    "# Project Overview",
    "",
    context.summary || "No overview yet.",
    "",
    "# Goals",
    "",
    formatBulletList(context.goals),
    "",
    "# Tasks",
    "",
    formatBulletList(context.actionItems),
    "",
    "# Risks",
    "",
    formatBulletList(context.risks),
    "",
    "# Notes",
    "",
    formatBulletList(context.notes),
    "",
  ].join("\n");
}
