import { getSupabaseAdminClient } from "@/lib/supabase";

export interface ProjectRecord {
  id: string;
  user_id: string;
  owner_email: string;
  name: string;
  created_at: string;
}

const DEFAULT_PROJECT_NAME = "Primary Project";

export async function getOrCreateProject(userId: string): Promise<ProjectRecord> {
  if (!userId) {
    throw new Error("User ID is required to get or create project.");
  }

  const supabase = getSupabaseAdminClient();
  const { data: owner, error: ownerError } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle<{ email: string | null }>();
  if (ownerError) {
    throw new Error(`Failed to load user email: ${ownerError.message}`);
  }
  const ownerEmail = owner?.email?.trim().toLowerCase();
  if (!ownerEmail) {
    throw new Error("Owner email is required to create project.");
  }

  const { data: existingProject, error: findError } = await supabase
    .from("projects")
    .select("id, user_id, owner_email, name, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ProjectRecord>();

  if (findError) {
    throw new Error(`Failed to find project: ${findError.message}`);
  }

  if (existingProject) {
    return existingProject;
  }

  const { data: createdProject, error: createError } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      owner_email: ownerEmail,
      name: DEFAULT_PROJECT_NAME,
    })
    .select("id, user_id, owner_email, name, created_at")
    .single<ProjectRecord>();

  if (createError || !createdProject) {
    throw new Error(`Failed to create project: ${createError?.message ?? "Unknown error"}`);
  }

  return createdProject;
}
