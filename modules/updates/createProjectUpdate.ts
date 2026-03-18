import { getSupabaseAdminClient } from "@/lib/supabase";

export interface ProjectUpdateRecord {
  id: string;
  project_id: string;
  content: string;
  raw_email: Record<string, unknown>;
  created_at: string;
}

interface CreateProjectUpdateInput {
  projectId: string;
  content: string;
  rawEmail: Record<string, unknown>;
}

export async function createProjectUpdate(
  input: CreateProjectUpdateInput,
): Promise<ProjectUpdateRecord> {
  const { projectId, content, rawEmail } = input;

  if (!projectId) {
    throw new Error("Project ID is required to create project update.");
  }

  if (!content.trim()) {
    throw new Error("Update content is required.");
  }

  const supabase = getSupabaseAdminClient();

  const { data: createdUpdate, error } = await supabase
    .from("project_updates")
    .insert({
      project_id: projectId,
      content,
      raw_email: rawEmail,
    })
    .select("id, project_id, content, raw_email, created_at")
    .single<ProjectUpdateRecord>();

  if (error || !createdUpdate) {
    throw new Error(`Failed to create project update: ${error?.message ?? "Unknown error"}`);
  }

  return createdUpdate;
}
