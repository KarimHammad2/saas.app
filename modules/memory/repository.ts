import { getMasterUserEmail } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { ProjectContext, RPMSuggestion, Tier, TransactionEvent, TransactionRecord, UserProfileContext } from "@/modules/contracts/types";

export interface UserRecord {
  id: string;
  email: string;
  tier: Tier;
  created_at: string;
}

export interface ProjectRecord {
  id: string;
  user_id: string;
  name: string;
  remainder_balance: number;
  created_at: string;
}

function emptyProfile(): UserProfileContext {
  return {
    communicationStyle: "",
    preferences: {},
    constraints: {},
    onboardingData: "",
    salesCallTranscripts: [],
    longTermInstructions: "",
    behaviorModifiers: {},
  };
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
}

export class MemoryRepository {
  private readonly supabase = getSupabaseAdminClient();

  async registerInboundEvent(provider: string, providerEventId: string, payload: Record<string, unknown>): Promise<boolean> {
    const { error } = await this.supabase.from("inbound_events").insert({
      provider,
      provider_event_id: providerEventId,
      payload,
    });

    if (!error) {
      return true;
    }

    if (error.code === "23505") {
      return false;
    }

    throw new Error(`Failed to register inbound event: ${error.message}`);
  }

  async getOrCreateUserByEmail(email: string): Promise<{ user: UserRecord; created: boolean }> {
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) {
      throw new Error("A valid email is required.");
    }

    const { data: existing } = await this.supabase
      .from("user_emails")
      .select("user_id")
      .eq("email", normalized)
      .limit(1)
      .maybeSingle<{ user_id: string }>();

    if (existing?.user_id) {
      const { data: user, error: userError } = await this.supabase
        .from("users")
        .select("id, email, tier, created_at")
        .eq("id", existing.user_id)
        .single<UserRecord>();

      if (userError || !user) {
        throw new Error(`Failed to fetch user by email: ${userError?.message ?? "Unknown error"}`);
      }

      return { user, created: false };
    }

    const { data: createdUser, error: createUserError } = await this.supabase
      .from("users")
      .insert({ email: normalized, master_email: getMasterUserEmail() })
      .select("id, email, tier, created_at")
      .single<UserRecord>();

    if (createUserError || !createdUser) {
      throw new Error(`Failed to create user: ${createUserError?.message ?? "Unknown error"}`);
    }

    const { error: emailError } = await this.supabase.from("user_emails").insert({
      user_id: createdUser.id,
      email: normalized,
      is_primary: true,
    });

    if (emailError) {
      throw new Error(`Failed to create user email: ${emailError.message}`);
    }

    const { error: profileError } = await this.supabase.from("user_profiles").upsert({
      user_id: createdUser.id,
    });

    if (profileError) {
      throw new Error(`Failed to initialize user profile: ${profileError.message}`);
    }

    return { user: createdUser, created: true };
  }

  async addAdditionalEmails(userId: string, emails: string[]): Promise<number> {
    const uniqueEmails = Array.from(
      new Set(
        emails
          .map(normalizeEmail)
          .filter((email) => isEmail(email)),
      ),
    );

    for (const email of uniqueEmails) {
      await this.supabase.from("user_emails").upsert(
        {
          user_id: userId,
          email,
          is_primary: false,
        },
        { onConflict: "user_id,email" },
      );
    }

    const { count, error } = await this.supabase
      .from("user_emails")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Failed to count user emails: ${error.message}`);
    }

    return count ?? 1;
  }

  async setUserTier(userId: string, tier: Tier): Promise<void> {
    const { error } = await this.supabase.from("users").update({ tier }).eq("id", userId);
    if (error) {
      throw new Error(`Failed to update user tier: ${error.message}`);
    }
  }

  async getOrCreateProject(userId: string, projectName = "Primary Project"): Promise<{ project: ProjectRecord; created: boolean }> {
    const { data: existing, error: findError } = await this.supabase
      .from("projects")
      .select("id, user_id, name, remainder_balance, created_at")
      .eq("user_id", userId)
      .eq("name", projectName)
      .limit(1)
      .maybeSingle<ProjectRecord>();

    if (findError) {
      throw new Error(`Failed to find project: ${findError.message}`);
    }

    if (existing) {
      return { project: existing, created: false };
    }

    const { data: created, error: createError } = await this.supabase
      .from("projects")
      .insert({ user_id: userId, name: projectName })
      .select("id, user_id, name, remainder_balance, created_at")
      .single<ProjectRecord>();

    if (createError || !created) {
      throw new Error(`Failed to create project: ${createError?.message ?? "Unknown error"}`);
    }

    await this.supabase.from("project_members").upsert(
      {
        project_id: created.id,
        user_id: userId,
        role: "owner",
      },
      { onConflict: "project_id,user_id" },
    );

    await this.supabase.from("project_states").upsert(
      {
        project_id: created.id,
      },
      { onConflict: "project_id" },
    );

    return { project: created, created: true };
  }

  async assignRpm(projectId: string, rpmEmail: string, assignedByEmail: string): Promise<void> {
    const normalizedRpm = normalizeEmail(rpmEmail);
    if (!isEmail(normalizedRpm)) {
      throw new Error("RPM email must be a valid email.");
    }

    const { error: deactivateError } = await this.supabase
      .from("rpm_assignments")
      .update({ is_active: false })
      .eq("project_id", projectId)
      .eq("is_active", true);

    if (deactivateError) {
      throw new Error(`Failed to deactivate previous RPM assignment: ${deactivateError.message}`);
    }

    const { error: insertError } = await this.supabase.from("rpm_assignments").insert({
      project_id: projectId,
      rpm_email: normalizedRpm,
      assigned_by_email: normalizeEmail(assignedByEmail),
      is_active: true,
    });

    if (insertError) {
      throw new Error(`Failed to assign RPM: ${insertError.message}`);
    }
  }

  async getActiveRpm(projectId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("rpm_assignments")
      .select("rpm_email")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ rpm_email: string }>();

    if (error) {
      throw new Error(`Failed to fetch active RPM: ${error.message}`);
    }

    return data?.rpm_email ?? null;
  }

  async storeRawProjectUpdate(projectId: string, content: string, rawEmail: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.from("project_updates").insert({
      project_id: projectId,
      content,
      raw_email: rawEmail,
    });

    if (error) {
      throw new Error(`Failed to create project update: ${error.message}`);
    }
  }

  async storeSummary(projectId: string, summary: string): Promise<void> {
    const { error } = await this.supabase
      .from("project_states")
      .upsert({ project_id: projectId, summary }, { onConflict: "project_id" });
    if (error) {
      throw new Error(`Failed to store summary: ${error.message}`);
    }
  }

  async appendActionItems(projectId: string, items: string[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const context = await this.getProjectState(projectId);
    const merged = Array.from(new Set([...context.actionItems, ...items]));
    const { error } = await this.supabase
      .from("project_states")
      .update({ action_items: merged, tasks: merged })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to append action items: ${error.message}`);
    }
  }

  async updateGoals(projectId: string, goals: string[]): Promise<void> {
    if (goals.length === 0) {
      return;
    }

    const context = await this.getProjectState(projectId);
    const merged = Array.from(new Set([...context.goals, ...goals]));
    const { error } = await this.supabase.from("project_states").update({ goals: merged }).eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to update goals: ${error.message}`);
    }
  }

  async updateDecisions(projectId: string, decisions: string[]): Promise<void> {
    if (decisions.length === 0) {
      return;
    }
    const context = await this.getProjectState(projectId);
    const merged = Array.from(new Set([...context.decisions, ...decisions]));
    const { error } = await this.supabase.from("project_states").update({ decisions: merged }).eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to update decisions: ${error.message}`);
    }
  }

  async updateRisks(projectId: string, risks: string[]): Promise<void> {
    if (risks.length === 0) {
      return;
    }
    const context = await this.getProjectState(projectId);
    const merged = Array.from(new Set([...context.risks, ...risks]));
    const { error } = await this.supabase
      .from("project_states")
      .update({ risks: merged })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to update risks: ${error.message}`);
    }
  }

  async updateRecommendations(projectId: string, recommendations: string[]): Promise<void> {
    if (recommendations.length === 0) {
      return;
    }
    const context = await this.getProjectState(projectId);
    const merged = Array.from(new Set([...context.recommendations, ...recommendations]));
    const { error } = await this.supabase
      .from("project_states")
      .update({ recommendations: merged })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to update recommendations: ${error.message}`);
    }
  }

  async updateNotes(projectId: string, notes: string[]): Promise<void> {
    if (notes.length === 0) {
      return;
    }

    const context = await this.getProjectState(projectId);
    const existing = context.notes ?? [];
    const seen = new Set(existing.map((entry) => entry.trim().toLowerCase()));

    const merged: string[] = [...existing];
    for (const note of notes) {
      const trimmed = note.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      merged.push(trimmed);
      seen.add(key);
    }

    const { error } = await this.supabase.from("project_states").update({ notes: merged }).eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to update notes: ${error.message}`);
    }
  }

  async storeUserProfileContext(userId: string, contextText: string): Promise<void> {
    const profile = await this.getUserProfile(userId);
    const updatedLongTerm = [profile.longTermInstructions, contextText].filter(Boolean).join("\n\n");
    const { error } = await this.supabase
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          long_term_instructions: updatedLongTerm,
        },
        { onConflict: "user_id" },
      );
    if (error) {
      throw new Error(`Failed to store user profile context: ${error.message}`);
    }
  }

  async storeRPMSuggestion(userId: string, projectId: string, fromEmail: string, content: string): Promise<RPMSuggestion> {
    const { data, error } = await this.supabase
      .from("rpm_suggestions")
      .insert({
        user_id: userId,
        project_id: projectId,
        from_email: normalizeEmail(fromEmail),
        content,
      })
      .select("id, user_id, project_id, from_email, content, status, created_at")
      .single<{
        id: string;
        user_id: string;
        project_id: string | null;
        from_email: string;
        content: string;
        status: "pending" | "approved" | "rejected";
        created_at: string;
      }>();

    if (error || !data) {
      throw new Error(`Failed to store RPM suggestion: ${error?.message ?? "Unknown error"}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      projectId: data.project_id,
      fromEmail: data.from_email,
      content: data.content,
      status: data.status,
      createdAt: data.created_at,
    };
  }

  async approveSuggestion(userId: string, suggestionId: string, approverEmail: string): Promise<void> {
    const { data: suggestion, error: fetchError } = await this.supabase
      .from("rpm_suggestions")
      .select("id, content, user_id, status")
      .eq("id", suggestionId)
      .eq("user_id", userId)
      .maybeSingle<{ id: string; content: string; user_id: string; status: "pending" | "approved" | "rejected" }>();

    if (fetchError || !suggestion) {
      throw new Error(`Failed to find suggestion to approve: ${fetchError?.message ?? "Not found"}`);
    }

    if (suggestion.status !== "pending") {
      return;
    }

    const { error: updateError } = await this.supabase
      .from("rpm_suggestions")
      .update({
        status: "approved",
        resolved_at: new Date().toISOString(),
        resolved_by_email: normalizeEmail(approverEmail),
      })
      .eq("id", suggestionId);

    if (updateError) {
      throw new Error(`Failed to approve suggestion: ${updateError.message}`);
    }

    await this.storeUserProfileContext(userId, suggestion.content);
  }

  async rejectSuggestion(userId: string, suggestionId: string, approverEmail: string): Promise<void> {
    const { data: suggestion, error: fetchError } = await this.supabase
      .from("rpm_suggestions")
      .select("id, user_id, status")
      .eq("id", suggestionId)
      .eq("user_id", userId)
      .maybeSingle<{ id: string; user_id: string; status: "pending" | "approved" | "rejected" }>();

    if (fetchError || !suggestion) {
      throw new Error(`Failed to find suggestion to reject: ${fetchError?.message ?? "Not found"}`);
    }

    if (suggestion.status !== "pending") {
      return;
    }

    const { error } = await this.supabase
      .from("rpm_suggestions")
      .update({
        status: "rejected",
        resolved_at: new Date().toISOString(),
        resolved_by_email: normalizeEmail(approverEmail),
      })
      .eq("id", suggestionId);

    if (error) {
      throw new Error(`Failed to reject suggestion: ${error.message}`);
    }
  }

  async getPendingSuggestions(userId: string): Promise<RPMSuggestion[]> {
    const { data, error } = await this.supabase
      .from("rpm_suggestions")
      .select("id, user_id, project_id, from_email, content, status, created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch pending suggestions: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      fromEmail: row.from_email,
      content: row.content,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  async storeTransactionEvent(projectId: string, fromEmail: string, event: TransactionEvent): Promise<void> {
    const { error } = await this.supabase.from("transactions").insert({
      project_id: projectId,
      created_by_email: normalizeEmail(fromEmail),
      type: "hourPurchase",
      hours_purchased: event.hoursPurchased,
      hourly_rate: event.hourlyRate,
      allocated_hours: event.allocatedHours,
      buffer_hours: event.bufferHours,
      saas2_fee: event.saas2Fee,
      project_remainder: event.projectRemainder,
    });

    if (error) {
      throw new Error(`Failed to store transaction event: ${error.message}`);
    }

    const context = await this.getProjectState(projectId);
    const nextRemainder = context.remainderBalance + event.projectRemainder;
    const { error: remainderError } = await this.supabase
      .from("projects")
      .update({ remainder_balance: nextRemainder })
      .eq("id", projectId);

    if (remainderError) {
      throw new Error(`Failed to update remainder balance: ${remainderError.message}`);
    }
  }

  async getUserProfile(userId: string): Promise<UserProfileContext> {
    const { data, error } = await this.supabase
      .from("user_profiles")
      .select(
        "communication_style, preferences, constraints, onboarding_data, sales_call_transcripts, long_term_instructions, behavior_modifiers",
      )
      .eq("user_id", userId)
      .maybeSingle<{
        communication_style: string;
        preferences: Record<string, unknown> | null;
        constraints: Record<string, unknown> | null;
        onboarding_data: string;
        sales_call_transcripts: unknown;
        long_term_instructions: string;
        behavior_modifiers: Record<string, unknown> | null;
      }>();

    if (error) {
      throw new Error(`Failed to load user profile: ${error.message}`);
    }

    if (!data) {
      return emptyProfile();
    }

    return {
      communicationStyle: data.communication_style ?? "",
      preferences: data.preferences ?? {},
      constraints: data.constraints ?? {},
      onboardingData: data.onboarding_data ?? "",
      salesCallTranscripts: asStringArray(data.sales_call_transcripts),
      longTermInstructions: data.long_term_instructions ?? "",
      behaviorModifiers: data.behavior_modifiers ?? {},
    };
  }

  async getProjectState(projectId: string): Promise<ProjectContext> {
    const { data: state, error: stateError } = await this.supabase
      .from("project_states")
      .select("project_id, summary, goals, action_items, decisions, risks, recommendations, notes")
      .eq("project_id", projectId)
      .maybeSingle<{
        project_id: string;
        summary: string;
        goals: unknown;
        action_items: unknown;
        decisions: unknown;
        risks: unknown;
        recommendations: unknown;
        notes: unknown;
      }>();

    if (stateError) {
      throw new Error(`Failed to load project state: ${stateError.message}`);
    }

    const { data: project, error: projectError } = await this.supabase
      .from("projects")
      .select("id, user_id, remainder_balance")
      .eq("id", projectId)
      .single<{ id: string; user_id: string; remainder_balance: number }>();

    if (projectError || !project) {
      throw new Error(`Failed to load project: ${projectError?.message ?? "Unknown error"}`);
    }

    const { data: transactions, error: txError } = await this.supabase
      .from("transactions")
      .select("id, type, hours_purchased, hourly_rate, allocated_hours, buffer_hours, saas2_fee, project_remainder, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (txError) {
      throw new Error(`Failed to load transactions: ${txError.message}`);
    }

    const transactionHistory: TransactionRecord[] = (transactions ?? []).map((row) => ({
      id: row.id,
      type: row.type,
      hoursPurchased: Number(row.hours_purchased ?? 0),
      hourlyRate: Number(row.hourly_rate ?? 0),
      allocatedHours: Number(row.allocated_hours ?? 0),
      bufferHours: Number(row.buffer_hours ?? 0),
      saas2Fee: Number(row.saas2_fee ?? 0),
      projectRemainder: Number(row.project_remainder ?? 0),
      createdAt: row.created_at,
    }));

    return {
      projectId: project.id,
      userId: project.user_id,
      summary: state?.summary ?? "",
      goals: asStringArray(state?.goals),
      actionItems: asStringArray(state?.action_items),
      decisions: asStringArray(state?.decisions),
      risks: asStringArray(state?.risks),
      recommendations: asStringArray(state?.recommendations),
      notes: asStringArray(state?.notes),
      remainderBalance: Number(project.remainder_balance ?? 0),
      transactionHistory,
    };
  }

  async snapshotProjectContext(projectId: string): Promise<void> {
    const context = await this.getProjectState(projectId);
    const { error } = await this.supabase.from("project_context_history").insert({
      project_id: projectId,
      summary: context.summary,
      goals: context.goals,
      action_items: context.actionItems,
      decisions: context.decisions,
      risks: context.risks,
      recommendations: context.recommendations,
    });
    if (error) {
      throw new Error(`Failed to snapshot project context: ${error.message}`);
    }
  }
}
