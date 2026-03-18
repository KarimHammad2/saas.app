export interface StructuredData {
  tasks: string[];
  goals: string[];
  risks: string[];
  notes: string[];
}

const TASK_KEYWORDS = ["we will", "next step", "todo", "need to", "action"];
const GOAL_KEYWORDS = ["goal", "objective", "we want to"];
const RISK_KEYWORDS = ["risk", "issue", "problem", "delay", "blocked"];

function createEmptyStructuredData(): StructuredData {
  return {
    tasks: [],
    goals: [],
    risks: [],
    notes: [],
  };
}

function splitIntoChunks(content: string): string[] {
  return content
    .split(/[\n.]+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function containsAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function extractStructuredData(content: string): StructuredData {
  const chunks = splitIntoChunks(content);
  const result = createEmptyStructuredData();

  for (const chunk of chunks) {
    const normalized = chunk.toLowerCase();

    if (containsAnyKeyword(normalized, TASK_KEYWORDS)) {
      result.tasks.push(chunk);
      continue;
    }

    if (containsAnyKeyword(normalized, GOAL_KEYWORDS)) {
      result.goals.push(chunk);
      continue;
    }

    if (containsAnyKeyword(normalized, RISK_KEYWORDS)) {
      result.risks.push(chunk);
      continue;
    }

    result.notes.push(chunk);
  }

  return result;
}
