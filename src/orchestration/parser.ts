import { createEmptyStructuredData, type StructuredProjectData } from "@/src/types/project.types";
import { parseNormalizedContent } from "@/modules/email/parseInbound";

function extractNotes(content: string): string[] {
  const match = content.match(/(?:^|\n)Notes:\s*([\s\S]*?)(?=\n(?:Summary|Goals|Tasks|Action Items|Decisions|Risks|Recommendations|Transaction|UserProfile|UserProfile Suggestion):|$)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export function parseEmailToStructuredData(text: string): StructuredProjectData {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return createEmptyStructuredData();
  const parsed = parseNormalizedContent(normalized);
  const notes = extractNotes(normalized);
  return {
    goals: parsed.goals,
    tasks: parsed.actionItems,
    risks: parsed.risks,
    notes: notes.length > 0 ? notes : parsed.summary ? [parsed.summary] : [normalized],
    decisions: parsed.decisions,
  };
}
