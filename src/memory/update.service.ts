import { getSupabaseAdminClient } from "@/lib/supabase";
import type { ProjectUpdateRecord, StructuredProjectData } from "@/src/types/project.types";

export class UpdateService {
  private readonly supabase = getSupabaseAdminClient();

  async storeUpdate(projectId: string, rawInput: string, structuredData: StructuredProjectData): Promise<ProjectUpdateRecord> {
    const { data, error } = await this.supabase
      .from("updates")
      .insert({
        project_id: projectId,
        raw_input: rawInput,
        structured_data: structuredData,
      })
      .select("id, project_id, raw_input, structured_data, created_at")
      .single<ProjectUpdateRecord>();

    if (error || !data) {
      throw new Error(`Failed to store update: ${error?.message ?? "Unknown error"}`);
    }

    return data;
  }

  async storeUserProfileContext(userId: string, context: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.from("user_profile_context").insert({
      user_id: userId,
      context_json: context,
    });

    if (error) {
      throw new Error(`Failed to store user profile context: ${error.message}`);
    }
  }

  async storeRPMSuggestion(projectId: string, suggestion: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.from("rpm_suggestions").insert({
      project_id: projectId,
      user_id: suggestion.user_id,
      from_email: suggestion.from_email,
      content: JSON.stringify(suggestion),
      status: "pending",
    });

    if (error) {
      throw new Error(`Failed to store RPM suggestion: ${error.message}`);
    }
  }

  async storeTransactionEvent(projectId: string, event: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.from("transaction_events").insert({
      project_id: projectId,
      event_json: event,
    });

    if (error) {
      throw new Error(`Failed to store transaction event: ${error.message}`);
    }
  }
}
