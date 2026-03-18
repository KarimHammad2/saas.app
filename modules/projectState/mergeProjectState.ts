import { StructuredData } from "@/modules/projectState/extractStructuredData";

export interface ProjectState {
  summary: string;
  goals: string[];
  tasks: string[];
  risks: string[];
  notes: string[];
}

export function createEmptyProjectState(): ProjectState {
  return {
    summary: "",
    goals: [],
    tasks: [],
    risks: [],
    notes: [],
  };
}

function normalizeEntry(entry: string): string {
  return entry.trim().toLowerCase();
}

function mergeUnique(existing: string[], incoming: string[]): string[] {
  const merged = [...existing];
  const seen = new Set(existing.map(normalizeEntry));

  for (const item of incoming) {
    const normalized = normalizeEntry(item);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    merged.push(item.trim());
    seen.add(normalized);
  }

  return merged;
}

export function mergeProjectState(existingState: ProjectState, newData: StructuredData): ProjectState {
  return {
    summary: existingState.summary,
    goals: mergeUnique(existingState.goals, newData.goals),
    tasks: mergeUnique(existingState.tasks, newData.tasks),
    risks: mergeUnique(existingState.risks, newData.risks),
    notes: mergeUnique(existingState.notes, newData.notes),
  };
}
