import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  createEmptyProjectState,
  type ProjectRecord,
  type ProjectStateDocument,
  type StructuredProjectData,
} from "@/src/types/project.types";

function uniqueMerge(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming].map((item) => item.trim()).filter(Boolean)));
}

function mergeProjectState(existing: ProjectStateDocument, update: StructuredProjectData): ProjectStateDocument {
  const timestamp = new Date().toISOString();
  const firstOverviewNote = update.notes.find((note) => note.trim().length > 0) ?? existing.overview;

  return {
    overview: firstOverviewNote,
    goals: uniqueMerge(existing.goals, update.goals),
    tasks: uniqueMerge(existing.tasks, update.tasks),
    risks: uniqueMerge(existing.risks, update.risks),
    notes: uniqueMerge(existing.notes, update.notes),
    decisions: uniqueMerge(existing.decisions, update.decisions),
    timeline: [
      ...existing.timeline,
      {
        timestamp,
        summary: `Processed update with ${update.tasks.length} task(s), ${update.goals.length} goal(s).`,
      },
    ],
    history: [...existing.history, { timestamp, update }],
  };
}

export class ProjectService {
  private readonly supabase = getSupabaseAdminClient();

  async createProject(userId: string): Promise<ProjectRecord> {
    const { data, error } = await this.supabase
      .from("projects")
      .insert({ user_id: userId, name: "Primary Project" })
      .select("id, user_id, name, created_at")
      .single<ProjectRecord>();

    if (error || !data) {
      throw new Error(`Failed to create project: ${error?.message ?? "Unknown error"}`);
    }

    return data;
  }

  async getProjectByUserId(userId: string): Promise<ProjectRecord | null> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("id, user_id, name, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<ProjectRecord>();

    if (error) {
      throw new Error(`Failed to fetch project by user: ${error.message}`);
    }

    return data ?? null;
  }

  async updateProject(projectId: string, structuredData: StructuredProjectData): Promise<void> {
    const currentState = await this.getProjectState(projectId);
    const nextState = mergeProjectState(currentState, structuredData);

    const { error } = await this.supabase.from("project_state").upsert(
      {
        project_id: projectId,
        state_json: nextState,
      },
      { onConflict: "project_id" },
    );

    if (error) {
      throw new Error(`Failed to update project state: ${error.message}`);
    }
  }

  async getProjectState(projectId: string): Promise<ProjectStateDocument> {
    const { data, error } = await this.supabase
      .from("project_state")
      .select("state_json")
      .eq("project_id", projectId)
      .maybeSingle<{ state_json: ProjectStateDocument | null }>();

    if (error) {
      throw new Error(`Failed to fetch project state: ${error.message}`);
    }

    return data?.state_json ?? createEmptyProjectState();
  }
}
