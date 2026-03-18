import { getSupabaseAdminClient } from "@/lib/supabase";
import { extractStructuredData } from "@/modules/projectState/extractStructuredData";
import {
  createEmptyProjectState,
  mergeProjectState,
  type ProjectState,
} from "@/modules/projectState/mergeProjectState";

interface ProjectUpdateRow {
  id: string;
  content: string;
  created_at: string;
}

interface ProjectStateRow {
  project_id: string;
  summary: string;
  goals: unknown;
  tasks: unknown;
  risks: unknown;
  notes: unknown;
}

const SUMMARY_SOURCE_UPDATES_COUNT = 3;
const SUMMARY_MAX_LENGTH = 500;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function generateSummary(updates: ProjectUpdateRow[]): string {
  const latestUpdates = updates.slice(-SUMMARY_SOURCE_UPDATES_COUNT);
  const combined = latestUpdates.map((update) => normalizeWhitespace(update.content)).join(" ");
  const trimmed = combined.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= SUMMARY_MAX_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, SUMMARY_MAX_LENGTH).trimEnd()}...`;
}

function fromProjectStateRow(row: ProjectStateRow): ProjectState {
  return {
    summary: typeof row.summary === "string" ? row.summary : "",
    goals: toStringArray(row.goals),
    tasks: toStringArray(row.tasks),
    risks: toStringArray(row.risks),
    notes: toStringArray(row.notes),
  };
}

export async function buildProjectState(projectId: string): Promise<ProjectState> {
  if (!projectId.trim()) {
    throw new Error("Project ID is required to build project state.");
  }

  const supabase = getSupabaseAdminClient();

  const { data: existingRow, error: existingError } = await supabase
    .from("project_states")
    .select("project_id, summary, goals, tasks, risks, notes")
    .eq("project_id", projectId)
    .maybeSingle<ProjectStateRow>();

  if (existingError) {
    throw new Error(`Failed to fetch existing project state: ${existingError.message}`);
  }

  const { data: updates, error: updatesError } = await supabase
    .from("project_updates")
    .select("id, content, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .returns<ProjectUpdateRow[]>();

  if (updatesError) {
    throw new Error(`Failed to fetch project updates: ${updatesError.message}`);
  }

  let state = existingRow ? fromProjectStateRow(existingRow) : createEmptyProjectState();

  for (const update of updates ?? []) {
    const extracted = extractStructuredData(update.content);
    state = mergeProjectState(state, extracted);
  }

  const summary = generateSummary(updates ?? []);
  const nextState: ProjectState = {
    ...state,
    summary,
  };

  const { error: upsertError } = await supabase.from("project_states").upsert(
    {
      project_id: projectId,
      summary: nextState.summary,
      goals: nextState.goals,
      tasks: nextState.tasks,
      risks: nextState.risks,
      notes: nextState.notes,
    },
    { onConflict: "project_id" },
  );

  if (upsertError) {
    throw new Error(`Failed to upsert project state: ${upsertError.message}`);
  }

  return nextState;
}
