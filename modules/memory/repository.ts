import { getMasterUserEmail } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type {
  CommunicationStyleContext,
  ProjectContext,
  ProjectDomain,
  ProjectStatus,
  RPMSuggestion,
  RPMSuggestionSource,
  Tier,
  TransactionEvent,
  TransactionRecord,
  UserProfileContext,
  UserProfileStructuredContext,
} from "@/modules/contracts/types";
import { emptyUserProfileContext } from "@/modules/contracts/types";
import { mergeUniqueStringsPreserveOrder, normalizeListItemKey } from "@/modules/domain/mergeUniqueStrings";

export { mergeUniqueStringsPreserveOrder } from "@/modules/domain/mergeUniqueStrings";
import { deepMergeUserProfileContext, type JsonRecord } from "@/modules/domain/userProfileMerge";
import { parseSowSignalsFromUnknown } from "@/modules/domain/sowSignalsPatch";
import { normalizeMessageId } from "@/modules/email/messageId";
import { isIgnoredNoteInput } from "@/modules/email/noteInputValidation";
import { resolvePlanEntitlements } from "@/modules/domain/entitlements";
import { normalizeProjectNameCandidate } from "@/modules/domain/projectName";
import { normalizeTaskMatchKey } from "@/modules/domain/taskLabels";
import { parseStoredProjectDomain } from "@/modules/domain/projectDomain";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

function formatNoteDatePrefix(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  return `[${t.toISOString().slice(0, 10)}] `;
}

function noteHasDatePrefix(line: string): boolean {
  return /^\[\d{4}-\d{2}-\d{2}\]\s/.test(line.trim());
}

export interface UserRecord {
  id: string;
  email: string;
  display_name: string | null;
  tier: Tier;
  created_at: string;
}

export interface ProjectRecord {
  id: string;
  user_id: string;
  owner_email: string;
  name: string;
  status: ProjectStatus;
  project_code: string;
  remainder_balance: number;
  reminder_balance: number;
  usage_count: number;
  kickoff_completed_at: string | null;
  created_at: string;
}

export interface ClaimedInboundEmailJob {
  id: string;
  emailId: string;
  provider: string;
  payload: Record<string, unknown>;
  attempts: number;
}

function emptyProfile(): UserProfileContext {
  return emptyUserProfileContext();
}

function normalizeRawContextJson(raw: unknown): JsonRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as JsonRecord;
  if (o.sowSignals !== undefined) {
    return { ...o };
  }
  const flatKeys = [
    "role",
    "business",
    "industry",
    "project_type",
    "project_stage",
    "preferencesList",
    "tone",
    "business_type",
    "goals_style",
  ];
  const hasNested = [
    "communicationStyle",
    "longTermInstructions",
    "constraints",
    "preferences",
    "behaviorModifiers",
    "onboardingData",
  ].some((k) => o[k] !== undefined);
  const hasFlatSow = flatKeys.some((k) => o[k] !== undefined);
  if (hasNested) {
    if (hasFlatSow) {
      const sow = parseSowSignalsFromUnknown(o);
      const rest = { ...o };
      for (const k of flatKeys) {
        delete rest[k];
      }
      if (Array.isArray(o.preferencesList)) {
        delete rest.preferencesList;
      }
      return { ...rest, sowSignals: sow as unknown as JsonRecord };
    }
    return { ...o };
  }
  if (hasFlatSow) {
    return { sowSignals: parseSowSignalsFromUnknown(o) as unknown as JsonRecord };
  }
  return { ...o };
}

function mergeJsonRecords(base: Record<string, unknown>, overlay: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return { ...(base ?? {}), ...(overlay ?? {}) };
}

function parseOnboardingJson(legacyText: string, fromContext: unknown): Record<string, unknown> {
  if (fromContext && typeof fromContext === "object" && !Array.isArray(fromContext)) {
    return fromContext as Record<string, unknown>;
  }
  const t = legacyText?.trim();
  if (t) {
    return { notes: t };
  }
  return {};
}

function rowToUserProfileContext(data: {
  communication_style: string;
  preferences: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  onboarding_data: string;
  sales_call_transcripts: unknown;
  long_term_instructions: string;
  behavior_modifiers: Record<string, unknown> | null;
  context: unknown;
}): UserProfileContext {
  const normalized = normalizeRawContextJson(data.context);
  const commFromJson =
    typeof normalized.communicationStyle === "object" &&
    normalized.communicationStyle !== null &&
    !Array.isArray(normalized.communicationStyle)
      ? (normalized.communicationStyle as CommunicationStyleContext)
      : {};
  const communicationStyle: CommunicationStyleContext = { ...commFromJson };
  if (data.communication_style?.trim()) {
    if (!communicationStyle.tone) {
      communicationStyle.tone = data.communication_style.trim();
    }
  }

  const longTermList = Array.isArray(normalized.longTermInstructions)
    ? normalized.longTermInstructions.filter((e): e is string => typeof e === "string")
    : [];
  const fromLegacyText = (data.long_term_instructions ?? "")
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const mergedLong = mergeUniqueStringsPreserveOrder(longTermList, fromLegacyText);

  const sow = parseSowSignalsFromUnknown(normalized.sowSignals);

  return {
    communicationStyle,
    preferences: mergeJsonRecords(data.preferences ?? {}, (normalized.preferences as Record<string, unknown>) ?? {}),
    constraints: mergeJsonRecords(data.constraints ?? {}, (normalized.constraints as Record<string, unknown>) ?? {}),
    onboardingData: parseOnboardingJson(data.onboarding_data, normalized.onboardingData),
    salesCallTranscripts: asStringArray(data.sales_call_transcripts),
    longTermInstructions: mergedLong,
    behaviorModifiers: mergeJsonRecords(data.behavior_modifiers ?? {}, (normalized.behaviorModifiers as Record<string, unknown>) ?? {}),
    structuredContext: sow,
  };
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeProjectStatus(value: string | null | undefined): ProjectStatus {
  switch ((value ?? "").trim().toLowerCase()) {
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "active":
    default:
      return "active";
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
}

function dedupePreserveOrder(values: string[]): string[] {
  return Array.from(new Set(values.map((entry) => entry.trim()).filter(Boolean)));
}

function noteSemanticKey(line: string): string {
  const t = line.trim();
  const withoutDate = t.replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, "");
  return normalizeListItemKey(withoutDate);
}

function normalizeSuggestionContentKey(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildProtectedTransactionSuggestionContent(proposerEmail: string, event: TransactionEvent): string {
  return [
    "[PROTECTED_UPDATE:TRANSACTION]",
    `Proposed by: ${normalizeEmail(proposerEmail)}`,
    `Hours Purchased: ${event.hoursPurchased}`,
    `Hourly Rate: ${event.hourlyRate}`,
    `Allocated to Freelancer: ${event.allocatedHours}`,
    `Buffer: ${event.bufferHours}`,
    `SaaS2 Fee: ${event.saas2Fee}`,
    `Project Remainder: ${event.projectRemainder}`,
    "Reply with: approve suggestion <id> to confirm this transaction.",
  ].join(" | ");
}

function parseProtectedTransactionSuggestion(
  content: string,
): { proposerEmail: string; event: TransactionEvent } | null {
  if (!content.includes("[PROTECTED_UPDATE:TRANSACTION]")) {
    return null;
  }

  const getNumber = (label: string): number | null => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = content.match(new RegExp(`${escaped}:\\s*([\\d.]+)`, "i"));
    if (!m?.[1]) {
      return null;
    }
    const parsed = Number(m[1]);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const proposerMatch = content.match(/Proposed by:\s*([^|]+)/i);
  const proposerEmail = proposerMatch?.[1]?.trim().toLowerCase();
  const hoursPurchased = getNumber("Hours Purchased");
  const hourlyRate = getNumber("Hourly Rate");
  const allocatedHours = getNumber("Allocated to Freelancer");
  const bufferHours = getNumber("Buffer");
  const saas2Fee = getNumber("SaaS2 Fee");
  const projectRemainder = getNumber("Project Remainder");

  if (
    !proposerEmail ||
    hoursPurchased === null ||
    hourlyRate === null ||
    allocatedHours === null ||
    bufferHours === null ||
    saas2Fee === null ||
    projectRemainder === null
  ) {
    return null;
  }

  return {
    proposerEmail,
    event: {
      hoursPurchased,
      hourlyRate,
      allocatedHours,
      bufferHours,
      saas2Fee,
      projectRemainder,
    },
  };
}

function parseSuggestionIntoStructuredContext(content: string): Partial<UserProfileStructuredContext> {
  const text = content.trim();
  if (!text) {
    return {};
  }

  const lowered = text.toLowerCase();
  const patch: Partial<UserProfileStructuredContext> = {};

  // Deterministic extraction only; no guessing.
  const roleMatch = lowered.match(/\b(?:i am|i'm|im)\s+(?:a|an)?\s*([a-z][a-z\s-]{2,40})\s+building\b/);
  if (roleMatch?.[1]) {
    patch.role = roleMatch[1].replace(/\s+/g, " ").trim();
  } else if (/\bsolo founder\b/.test(lowered)) {
    patch.role = "solo founder";
  }

  const businessMatch = lowered.match(/\bbuilding\s+(?:a|an)?\s*([a-z0-9][a-z0-9\s-]{1,40})\b/);
  if (businessMatch?.[1]) {
    patch.business = businessMatch[1].replace(/\s+/g, " ").trim().replace(/[.!,;:]$/, "");
  } else if (/\bsaas\b/.test(lowered)) {
    patch.business = "SaaS";
  }

  const preferenceMatches = [
    ...text.matchAll(/\b(?:prefers?|preference|likes?|wants?)\s+([a-z0-9][a-z0-9\s-]{2,60})/gi),
    ...text.matchAll(/\b(short answers?|concise answers?|brief answers?)\b/gi),
  ];
  const preferenceList = dedupePreserveOrder(
    preferenceMatches
      .map((match) => (match[1] ?? match[0] ?? "").trim().replace(/[.!,;:]$/, ""))
      .filter(Boolean),
  );
  if (preferenceList.length > 0) {
    patch.preferencesList = preferenceList;
  }

  return patch;
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

  async enqueueInboundEmailJob(emailId: string, provider: string, payload: Record<string, unknown>): Promise<boolean> {
    const dedupeKey = emailId.trim();
    if (!dedupeKey) {
      throw new Error("Inbound email id is required.");
    }
    const normalizedProvider = provider.trim();
    if (!normalizedProvider) {
      throw new Error("Inbound provider is required.");
    }

    const { data, error } = await this.supabase.rpc("enqueue_inbound_email_job", {
      p_email_id: dedupeKey,
      p_provider: normalizedProvider,
      p_payload: payload,
    });
    if (error) {
      throw new Error(`Failed to enqueue inbound email job: ${error.message}`);
    }
    return Boolean(data);
  }

  async claimNextInboundEmailJob(): Promise<ClaimedInboundEmailJob | null> {
    const { data, error } = await this.supabase.rpc("claim_next_inbound_email_job");
    if (error) {
      throw new Error(`Failed to claim inbound email job: ${error.message}`);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      emailId: String(row.email_id),
      provider: String(row.provider),
      payload:
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {},
      attempts: Number(row.attempts ?? 0),
    };
  }

  async markInboundEmailProcessed(jobId: string, emailId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error: jobError } = await this.supabase
      .from("inbound_email_jobs")
      .update({
        status: "processed",
        processed_at: nowIso,
        available_at: nowIso,
        last_error: null,
      })
      .eq("id", jobId);
    if (jobError) {
      throw new Error(`Failed to mark inbound job processed: ${jobError.message}`);
    }

    const { error: ledgerError } = await this.supabase
      .from("processed_emails")
      .update({
        status: "processed",
        processed_at: nowIso,
        last_error: null,
      })
      .eq("email_id", emailId);
    if (ledgerError) {
      throw new Error(`Failed to mark processed email complete: ${ledgerError.message}`);
    }
  }

  async rescheduleInboundEmailJob(jobId: string, emailId: string, errorMessage: string, delaySeconds: number): Promise<void> {
    const safeDelaySeconds = Number.isFinite(delaySeconds) ? Math.max(1, Math.floor(delaySeconds)) : 1;
    const availableAtIso = new Date(Date.now() + safeDelaySeconds * 1000).toISOString();
    const normalizedError = errorMessage.trim().slice(0, 2000);
    const { error: jobError } = await this.supabase
      .from("inbound_email_jobs")
      .update({
        status: "queued",
        available_at: availableAtIso,
        last_error: normalizedError || null,
      })
      .eq("id", jobId);
    if (jobError) {
      throw new Error(`Failed to reschedule inbound job: ${jobError.message}`);
    }

    const { error: ledgerError } = await this.supabase
      .from("processed_emails")
      .update({
        status: "queued",
        last_error: normalizedError || null,
      })
      .eq("email_id", emailId);
    if (ledgerError) {
      throw new Error(`Failed to reschedule processed email: ${ledgerError.message}`);
    }
  }

  async markInboundEmailFailed(jobId: string, emailId: string, errorMessage: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const normalizedError = errorMessage.trim().slice(0, 2000);
    const { error: jobError } = await this.supabase
      .from("inbound_email_jobs")
      .update({
        status: "failed",
        processed_at: nowIso,
        available_at: nowIso,
        last_error: normalizedError || null,
      })
      .eq("id", jobId);
    if (jobError) {
      throw new Error(`Failed to mark inbound job failed: ${jobError.message}`);
    }

    const { error: ledgerError } = await this.supabase
      .from("processed_emails")
      .update({
        status: "failed",
        last_error: normalizedError || null,
      })
      .eq("email_id", emailId);
    if (ledgerError) {
      throw new Error(`Failed to mark processed email failed: ${ledgerError.message}`);
    }
  }

  async markFallbackEmailSent(emailId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("processed_emails")
      .update({
        fallback_sent_at: new Date().toISOString(),
      })
      .eq("email_id", emailId)
      .is("fallback_sent_at", null)
      .select("email_id")
      .maybeSingle<{ email_id: string }>();
    if (error) {
      throw new Error(`Failed to mark fallback email sent: ${error.message}`);
    }
    return Boolean(data?.email_id);
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
        .select("id, email, display_name, tier, created_at")
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
      .select("id, email, display_name, tier, created_at")
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

  /**
   * One project per user (Phase 1): reuse the oldest project row for this user, or create "Primary Project".
   * The project name argument on `getOrCreateProject` is ignored — kept for API compatibility.
   */
  async getOrCreatePrimaryProject(userId: string): Promise<{ project: ProjectRecord; created: boolean }> {
    const ownerEmail = await this.getUserEmailById(userId);
    if (!ownerEmail) {
      throw new Error("Failed to resolve owner email for project creation.");
    }
    const { data: existing, error: findError } = await this.supabase
      .from("projects")
      .select("id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
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
      .insert({ user_id: userId, owner_email: ownerEmail, name: "Primary Project", status: "active" })
      .select("id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, created_at")
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

  /** @deprecated Use {@link getOrCreatePrimaryProject}. Name is ignored — one project per user. */
  async getOrCreateProject(userId: string, _projectName = "Primary Project"): Promise<{ project: ProjectRecord; created: boolean }> {
    return this.getOrCreatePrimaryProject(userId);
  }

  /**
   * Resolve a project by human-readable code for this user only (prevents cross-user routing).
   */
  async findProjectByCodeAndUser(code: string, userId: string): Promise<ProjectRecord | null> {
    const normalized = code.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const { data, error } = await this.supabase
      .from("projects")
      .select("id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, created_at")
      .eq("project_code", normalized)
      .eq("user_id", userId)
      .maybeSingle<ProjectRecord>();

    if (error) {
      throw new Error(`Failed to find project by code: ${error.message}`);
    }
    return data ?? null;
  }

  /**
   * Resolve a project from a prior outbound Message-Id stored in email_thread_map, scoped to this user.
   */
  async findProjectByThreadMessageIdForUser(messageId: string, userId: string): Promise<ProjectRecord | null> {
    const normalized = normalizeMessageId(messageId);
    if (!normalized) {
      return null;
    }
    const { data: mapRow, error: mapError } = await this.supabase
      .from("email_thread_map")
      .select("project_id")
      .eq("message_id", normalized)
      .maybeSingle<{ project_id: string }>();

    if (mapError) {
      throw new Error(`Failed to look up thread mapping: ${mapError.message}`);
    }
    if (!mapRow) {
      return null;
    }

    const { data: project, error: projectError } = await this.supabase
      .from("projects")
      .select("id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, created_at")
      .eq("id", mapRow.project_id)
      .eq("user_id", userId)
      .maybeSingle<ProjectRecord>();

    if (projectError) {
      throw new Error(`Failed to load project for thread: ${projectError.message}`);
    }
    return project ?? null;
  }

  /**
   * Resolve a project from thread Message-Id without scoping to a single user (participant routing).
   */
  async findProjectByThreadMessageId(messageId: string): Promise<ProjectRecord | null> {
    const normalized = normalizeMessageId(messageId);
    if (!normalized) {
      return null;
    }
    const { data: mapRow, error: mapError } = await this.supabase
      .from("email_thread_map")
      .select("project_id")
      .eq("message_id", normalized)
      .maybeSingle<{ project_id: string }>();

    if (mapError) {
      throw new Error(`Failed to look up thread mapping: ${mapError.message}`);
    }
    if (!mapRow) {
      return null;
    }

    const { data: project, error: projectError } = await this.supabase
      .from("projects")
      .select("id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, created_at")
      .eq("id", mapRow.project_id)
      .maybeSingle<ProjectRecord>();

    if (projectError) {
      throw new Error(`Failed to load project for thread: ${projectError.message}`);
    }
    return project ?? null;
  }

  /**
   * Resolve project by globally unique project_code (any owner).
   */
  async findProjectByCode(code: string): Promise<ProjectRecord | null> {
    const normalized = code.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const { data, error } = await this.supabase
      .from("projects")
      .select("id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, created_at")
      .eq("project_code", normalized)
      .maybeSingle<ProjectRecord>();

    if (error) {
      throw new Error(`Failed to find project by code: ${error.message}`);
    }
    return data ?? null;
  }

  async getUserEmailById(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("users")
      .select("email")
      .eq("id", userId)
      .maybeSingle<{ email: string | null }>();

    if (error) {
      throw new Error(`Failed to load user email: ${error.message}`);
    }
    const e = data?.email?.trim();
    return e ? normalizeEmail(e) : null;
  }

  async findProjectsOwnedByUser(userId: string): Promise<ProjectRecord[]> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, created_at")
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Failed to list owned projects: ${error.message}`);
    }
    return (data ?? []) as ProjectRecord[];
  }

  /**
   * Projects that list this email in participant_emails (collaborator / CC thread), excluding ownership-only matches.
   */
  async findProjectsWhereEmailInParticipantList(email: string): Promise<ProjectRecord[]> {
    const n = normalizeEmail(email);
    if (!isEmail(n)) {
      return [];
    }

    const { data, error } = await this.supabase
      .from("projects")
      .select("id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, created_at")
      .contains("participant_emails", [n]);

    if (error) {
      throw new Error(`Failed to list collaborator projects: ${error.message}`);
    }
    return (data ?? []) as ProjectRecord[];
  }

  async mergeProjectParticipants(projectId: string, emails: string[]): Promise<void> {
    const normalized = Array.from(
      new Set(
        emails
          .map(normalizeEmail)
          .filter((e) => isEmail(e)),
      ),
    );
    if (normalized.length === 0) {
      return;
    }

    const { data, error } = await this.supabase
      .from("projects")
      .select("participant_emails")
      .eq("id", projectId)
      .maybeSingle<{ participant_emails: unknown }>();

    if (error) {
      throw new Error(`Failed to load project participants: ${error.message}`);
    }

    const existingRaw = data?.participant_emails;
    const existing = Array.isArray(existingRaw)
      ? existingRaw.filter((entry): entry is string => typeof entry === "string").map(normalizeEmail)
      : [];

    const merged = mergeUniqueStringsPreserveOrder(existing, normalized);
    const { error: updateError } = await this.supabase.from("projects").update({ participant_emails: merged }).eq("id", projectId);
    if (updateError) {
      throw new Error(`Failed to update project participants: ${updateError.message}`);
    }
  }

  async appendRecentUpdate(projectId: string, line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const { data, error } = await this.supabase
      .from("project_states")
      .select("recent_updates")
      .eq("project_id", projectId)
      .maybeSingle<{ recent_updates: unknown }>();

    if (error) {
      throw new Error(`Failed to load recent updates: ${error.message}`);
    }

    const existing = asStringArray(data?.recent_updates);
    const dated = `[${new Date().toISOString().slice(0, 10)}] ${trimmed}`;
    const next = [...existing, dated].slice(-100);

    const { error: updateError } = await this.supabase
      .from("project_states")
      .update({ recent_updates: next })
      .eq("project_id", projectId);

    if (updateError) {
      throw new Error(`Failed to append recent update: ${updateError.message}`);
    }
  }

  async storeOutboundThreadMapping(messageId: string, projectId: string): Promise<void> {
    const normalized = normalizeMessageId(messageId);
    if (!normalized) {
      return;
    }
    const { error } = await this.supabase.from("email_thread_map").upsert(
      { message_id: normalized, project_id: projectId },
      { onConflict: "message_id" },
    );
    if (error) {
      throw new Error(`Failed to store email thread mapping: ${error.message}`);
    }
  }

  async recordOutboundEmailEvent(input: {
    projectId?: string | null;
    userId?: string | null;
    inboundEventId?: string | null;
    kind: string;
    provider?: string | null;
    status: "sent" | "failed";
    recipientCount: number;
    messageId?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    const { error } = await this.supabase.from("outbound_email_events").insert({
      project_id: input.projectId ?? null,
      user_id: input.userId ?? null,
      inbound_event_id: input.inboundEventId ?? null,
      kind: input.kind,
      provider: input.provider ?? null,
      status: input.status,
      recipient_count: Math.max(0, Math.floor(input.recipientCount)),
      message_id: input.messageId ?? null,
      error_message: input.errorMessage ?? null,
    });
    if (error) {
      throw new Error(`Failed to record outbound email event: ${error.message}`);
    }
  }

  /**
   * Always inserts a new project row (multi-project flow). Trigger assigns project_code if omitted.
   */
  async createProjectForUser(userId: string, name = "New Project"): Promise<{ project: ProjectRecord; created: boolean }> {
    const ownerEmail = await this.getUserEmailById(userId);
    if (!ownerEmail) {
      throw new Error("Failed to resolve owner email for project creation.");
    }
    const trimmed = name.trim() || "New Project";
    const { data: created, error: createError } = await this.supabase
      .from("projects")
      .insert({ user_id: userId, owner_email: ownerEmail, name: trimmed.slice(0, 200), status: "active" })
      .select("id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, created_at")
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

  async updateProjectName(projectId: string, name: string): Promise<void> {
    const normalized = normalizeProjectNameCandidate(name);
    if (!normalized) {
      return;
    }

    const { error } = await this.supabase.from("projects").update({ name: normalized }).eq("id", projectId);
    if (error) {
      throw new Error(`Failed to update project name: ${error.message}`);
    }
  }

  async updateProjectStatus(projectId: string, status: ProjectStatus): Promise<void> {
    const normalized = normalizeProjectStatus(status);
    const { error } = await this.supabase.from("projects").update({ status: normalized }).eq("id", projectId);
    if (error) {
      throw new Error(`Failed to update project status: ${error.message}`);
    }
  }

  async setProjectDomain(projectId: string, domain: ProjectDomain): Promise<void> {
    const { error } = await this.supabase.from("projects").update({ project_domain: domain }).eq("id", projectId);
    if (error) {
      throw new Error(`Failed to set project domain: ${error.message}`);
    }
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
    const compact = compactOverviewForDocument(summary);
    const { data: row, error: fetchError } = await this.supabase
      .from("project_states")
      .select("initial_summary")
      .eq("project_id", projectId)
      .maybeSingle<{ initial_summary: string | null }>();

    if (fetchError) {
      throw new Error(`Failed to read project state for summary: ${fetchError.message}`);
    }

    const payload: { project_id: string; summary: string; initial_summary?: string } = {
      project_id: projectId,
      summary: compact,
    };
    if (!row?.initial_summary?.trim()) {
      payload.initial_summary = compact;
    }

    const { error } = await this.supabase.from("project_states").upsert(payload, { onConflict: "project_id" });
    if (error) {
      throw new Error(`Failed to store summary: ${error.message}`);
    }
  }

  /** Updates displayed overview only (does not change `initial_summary`). Used for rule-based regeneration. */
  async updateSummaryDisplay(projectId: string, summary: string): Promise<void> {
    const compact = compactOverviewForDocument(summary);
    const { error } = await this.supabase.from("project_states").update({ summary: compact }).eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to update summary: ${error.message}`);
    }
  }

  async updateCurrentStatus(projectId: string, status: string): Promise<void> {
    const trimmed = status.trim();
    if (!trimmed) {
      return;
    }
    const { error } = await this.supabase
      .from("project_states")
      .upsert({ project_id: projectId, current_status: trimmed }, { onConflict: "project_id" });
    if (error) {
      throw new Error(`Failed to update current status: ${error.message}`);
    }
  }

  async appendActionItems(projectId: string, items: string[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const context = await this.getProjectState(projectId);
    const merged = mergeUniqueStringsPreserveOrder(context.actionItems, items);
    const { error } = await this.supabase
      .from("project_states")
      .update({ action_items: merged, tasks: merged })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to append action items: ${error.message}`);
    }
  }

  /** Replace one action item line in place (same index); used for UPDATE_TASK intent. */
  async replaceActionItem(projectId: string, oldText: string, newText: string): Promise<void> {
    const trimmedNew = newText.trim();
    if (!trimmedNew) {
      return;
    }

    const context = await this.getProjectState(projectId);
    const items = context.actionItems;
    const key = normalizeTaskMatchKey(oldText);
    const idx = items.findIndex((item) => normalizeTaskMatchKey(item) === key);
    if (idx === -1) {
      return;
    }

    const next = [...items];
    next[idx] = trimmedNew;
    const { error } = await this.supabase
      .from("project_states")
      .update({ action_items: next, tasks: next })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to replace action item: ${error.message}`);
    }
  }

  async markTasksCompleted(projectId: string, items: string[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const context = await this.getProjectState(projectId);
    const merged = mergeUniqueStringsPreserveOrder(context.completedTasks, items);
    const keysToRemove = new Set(items.map((t) => normalizeTaskMatchKey(t)));
    const nextActionItems = context.actionItems.filter((item) => !keysToRemove.has(normalizeTaskMatchKey(item)));
    const { error } = await this.supabase
      .from("project_states")
      .update({ completed_tasks: merged, action_items: nextActionItems, tasks: nextActionItems })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to mark tasks completed: ${error.message}`);
    }
  }

  async updateGoals(projectId: string, goals: string[]): Promise<void> {
    if (goals.length === 0) {
      return;
    }

    const context = await this.getProjectState(projectId);
    const merged = mergeUniqueStringsPreserveOrder(context.goals, goals);
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
    const merged = mergeUniqueStringsPreserveOrder(context.decisions, decisions);
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
    const merged = mergeUniqueStringsPreserveOrder(context.risks, risks);
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
    const merged = mergeUniqueStringsPreserveOrder(context.recommendations, recommendations);
    const { error } = await this.supabase
      .from("project_states")
      .update({ recommendations: merged })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to update recommendations: ${error.message}`);
    }
  }

  async updateNotes(projectId: string, notes: string[], receivedAtIso?: string): Promise<void> {
    if (notes.length === 0) {
      return;
    }

    const context = await this.getProjectState(projectId);
    const existing = context.notes ?? [];
    const seen = new Set(existing.map((entry) => noteSemanticKey(entry)));

    const datePrefix = formatNoteDatePrefix(receivedAtIso);

    const merged: string[] = [...existing];
    for (const note of notes) {
      const trimmed = note.trim();
      if (!trimmed) {
        continue;
      }
      if (isIgnoredNoteInput(trimmed)) {
        continue;
      }
      const withPrefix = noteHasDatePrefix(trimmed) ? trimmed : `${datePrefix}${trimmed}`;
      const key = noteSemanticKey(withPrefix);
      if (seen.has(key)) {
        continue;
      }
      merged.push(withPrefix);
      seen.add(key);
    }

    const { error } = await this.supabase.from("project_states").update({ notes: merged }).eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to update notes: ${error.message}`);
    }
  }

  /**
   * Ensures a `user_profiles` row exists (e.g. legacy users created before profile rows).
   * Context JSON stays `{}` until the first merge/store; reads still return `emptyUserProfileContext()` when the row is missing.
   */
  async ensureUserProfileRow(userId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle<{ user_id: string }>();

    if (error) {
      throw new Error(`Failed to check user profile row: ${error.message}`);
    }
    if (data) {
      return;
    }

    const { error: insertError } = await this.supabase.from("user_profiles").insert({ user_id: userId });
    if (insertError && insertError.code !== "23505") {
      throw new Error(`Failed to create user profile row: ${insertError.message}`);
    }
  }

  private async readNormalizedContextJson(userId: string): Promise<JsonRecord> {
    const { data, error } = await this.supabase
      .from("user_profiles")
      .select("context")
      .eq("user_id", userId)
      .maybeSingle<{ context: unknown }>();

    if (error) {
      throw new Error(`Failed to read user profile context: ${error.message}`);
    }
    return normalizeRawContextJson(data?.context ?? {});
  }

  private async persistContextJson(userId: string, context: JsonRecord): Promise<void> {
    const longTerm = Array.isArray(context.longTermInstructions)
      ? context.longTermInstructions.filter((e): e is string => typeof e === "string")
      : [];
    const longText = longTerm.join("\n\n");
    const { error } = await this.supabase.from("user_profiles").upsert(
      {
        user_id: userId,
        context: context as unknown as Record<string, unknown>,
        long_term_instructions: longText,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      throw new Error(`Failed to persist user profile context: ${error.message}`);
    }
  }

  /** Deep-merge patch into `user_profiles.context` JSONB (never replaces unrelated keys). */
  async patchUserProfileContextJson(userId: string, patch: JsonRecord): Promise<void> {
    const base = await this.readNormalizedContextJson(userId);
    const merged = deepMergeUserProfileContext(base, patch);
    await this.persistContextJson(userId, merged);
  }

  async storeUserProfileContext(userId: string, contextText: string): Promise<void> {
    const trimmed = contextText.trim();
    if (!trimmed) {
      return;
    }
    await this.patchUserProfileContextJson(userId, { longTermInstructions: [trimmed] });
  }

  async replaceStructuredUserProfileContext(userId: string, next: UserProfileStructuredContext): Promise<void> {
    const base = await this.readNormalizedContextJson(userId);
    await this.persistContextJson(userId, { ...base, sowSignals: next as unknown as JsonRecord });
  }

  async mergeStructuredUserProfileContext(userId: string, patch: Partial<UserProfileStructuredContext>): Promise<void> {
    if (Object.keys(patch).length === 0) {
      return;
    }
    await this.patchUserProfileContextJson(userId, { sowSignals: patch as unknown as JsonRecord });
  }

  async updateUserDisplayNameIfEmpty(userId: string, displayName: string | null): Promise<void> {
    const trimmed = displayName?.trim();
    if (!trimmed) {
      return;
    }
    const { data: row, error: fetchError } = await this.supabase
      .from("users")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle<{ display_name: string | null }>();

    if (fetchError) {
      throw new Error(`Failed to read user display name: ${fetchError.message}`);
    }

    if (row?.display_name?.trim()) {
      return;
    }

    const { error } = await this.supabase
      .from("users")
      .update({ display_name: trimmed.slice(0, 200) })
      .eq("id", userId);

    if (error) {
      throw new Error(`Failed to update display name: ${error.message}`);
    }
  }

  async incrementProjectUsageCount(projectId: string): Promise<void> {
    const { data: row, error: fetchError } = await this.supabase
      .from("projects")
      .select("usage_count")
      .eq("id", projectId)
      .maybeSingle<{ usage_count: number }>();

    if (fetchError) {
      throw new Error(`Failed to read usage count: ${fetchError.message}`);
    }

    const next = (row?.usage_count ?? 0) + 1;
    const { error } = await this.supabase.from("projects").update({ usage_count: next }).eq("id", projectId);
    if (error) {
      throw new Error(`Failed to increment usage count: ${error.message}`);
    }
  }

  async setKickoffCompleted(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from("projects")
      .update({ kickoff_completed_at: new Date().toISOString() })
      .eq("id", projectId);

    if (error) {
      throw new Error(`Failed to record kickoff completion: ${error.message}`);
    }
  }

  async deletePendingSystemSuggestionsForProject(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from("rpm_suggestions")
      .delete()
      .eq("project_id", projectId)
      .eq("source", "system")
      .eq("status", "pending");

    if (error) {
      throw new Error(`Failed to clear system RPM suggestions: ${error.message}`);
    }
  }

  async storeRPMSuggestion(
    userId: string,
    projectId: string,
    fromEmail: string,
    content: string,
    source: RPMSuggestionSource = "inbound",
  ): Promise<RPMSuggestion> {
    const normalizedContent = content.replace(/\s+/g, " ").trim();
    if (!normalizedContent) {
      throw new Error("Cannot store empty RPM suggestion.");
    }

    const { data: existingPending, error: existingPendingError } = await this.supabase
      .from("rpm_suggestions")
      .select("id, user_id, project_id, from_email, content, status, created_at, source")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("source", source)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (existingPendingError) {
      throw new Error(`Failed to check existing RPM suggestions: ${existingPendingError.message}`);
    }

    const duplicate = (existingPending ?? []).find(
      (row) => normalizeSuggestionContentKey(row.content) === normalizeSuggestionContentKey(normalizedContent),
    );
    if (duplicate) {
      return {
        id: duplicate.id,
        userId: duplicate.user_id,
        projectId: duplicate.project_id,
        fromEmail: duplicate.from_email,
        content: duplicate.content,
        status: duplicate.status,
        createdAt: duplicate.created_at,
        source: (duplicate.source as RPMSuggestionSource) ?? source,
      };
    }

    const { data, error } = await this.supabase
      .from("rpm_suggestions")
      .insert({
        user_id: userId,
        project_id: projectId,
        from_email: normalizeEmail(fromEmail),
        content: normalizedContent,
        source,
      })
      .select("id, user_id, project_id, from_email, content, status, created_at, source")
      .single<{
        id: string;
        user_id: string;
        project_id: string | null;
        from_email: string;
        content: string;
        status: "pending" | "approved" | "rejected";
        created_at: string;
        source: RPMSuggestionSource;
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
      source: data.source,
    };
  }

  async storeProtectedTransactionSuggestion(
    userId: string,
    projectId: string,
    proposerEmail: string,
    event: TransactionEvent,
  ): Promise<RPMSuggestion> {
    return this.storeRPMSuggestion(
      userId,
      projectId,
      proposerEmail,
      buildProtectedTransactionSuggestionContent(proposerEmail, event),
      "inbound",
    );
  }

  async approveSuggestion(userId: string, suggestionId: string, approverEmail: string): Promise<void> {
    const { data: suggestion, error: fetchError } = await this.supabase
      .from("rpm_suggestions")
      .select("id, project_id, content, user_id, status, source")
      .eq("id", suggestionId)
      .eq("user_id", userId)
      .maybeSingle<{
        id: string;
        project_id: string | null;
        content: string;
        user_id: string;
        status: "pending" | "approved" | "rejected";
        source: RPMSuggestionSource;
      }>();

    if (fetchError) {
      throw new Error(`Failed to find suggestion to approve: ${fetchError.message}`);
    }
    if (!suggestion) {
      return;
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

    if (suggestion.project_id) {
      await this.appendRecentUpdate(suggestion.project_id, `Suggestion accepted [${suggestion.id}]: ${suggestion.content}`);
    }

    const protectedTransaction = parseProtectedTransactionSuggestion(suggestion.content);
    if (protectedTransaction && suggestion.project_id) {
      await this.storeTransactionEvent(suggestion.project_id, protectedTransaction.proposerEmail, protectedTransaction.event);
      await this.appendRecentUpdate(
        suggestion.project_id,
        `Protected transaction approved [${suggestion.id}] by ${normalizeEmail(approverEmail)} (proposed by ${protectedTransaction.proposerEmail})`,
      );
      return;
    }

    if (suggestion.source === "inbound") {
      await this.storeUserProfileContext(userId, suggestion.content);

      const structuredPatch = parseSuggestionIntoStructuredContext(suggestion.content);
      if (Object.keys(structuredPatch).length > 0) {
        await this.mergeStructuredUserProfileContext(userId, structuredPatch);
      }
    }
  }

  async rejectSuggestion(userId: string, suggestionId: string, approverEmail: string): Promise<void> {
    const { data: suggestion, error: fetchError } = await this.supabase
      .from("rpm_suggestions")
      .select("id, project_id, user_id, status")
      .eq("id", suggestionId)
      .eq("user_id", userId)
      .maybeSingle<{ id: string; project_id: string | null; user_id: string; status: "pending" | "approved" | "rejected" }>();

    if (fetchError) {
      throw new Error(`Failed to find suggestion to reject: ${fetchError.message}`);
    }
    if (!suggestion) {
      return;
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

    if (suggestion.project_id) {
      await this.appendRecentUpdate(suggestion.project_id, `Suggestion rejected [${suggestion.id}]`);
    }
  }

  async getPendingSuggestions(userId: string, projectId?: string): Promise<RPMSuggestion[]> {
    let query = this.supabase
      .from("rpm_suggestions")
      .select("id, user_id, project_id, from_email, content, status, created_at, source")
      .eq("user_id", userId)
      .eq("status", "pending");

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

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
      source: (row.source as RPMSuggestionSource) ?? "inbound",
    }));
  }

  async listProjectsForReminder(idleDays: number): Promise<
    Array<{ projectId: string; userId: string; userEmail: string; projectName: string; reminderBalance: number }>
  > {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase.rpc("list_projects_for_reminder", {
      p_idle_days: idleDays,
      p_now: nowIso,
    });

    if (error) {
      throw new Error(`Failed to list reminder projects: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{
      project_id: string;
      user_id: string;
      user_email: string;
      project_name: string;
      reminder_balance: number;
    }>;

    return rows.map((row) => ({
      projectId: row.project_id,
      userId: row.user_id,
      userEmail: row.user_email,
      projectName: row.project_name,
      reminderBalance: row.reminder_balance,
    }));
  }

  async reserveReminderSlot(projectId: string, idleDays: number): Promise<string | null> {
    const now = new Date();
    const nowIso = now.toISOString();
    const idleThresholdIso = new Date(now.getTime() - Math.max(1, idleDays) * 24 * 60 * 60 * 1000).toISOString();

    const { data: project, error: projectError } = await this.supabase
      .from("projects")
      .select("reminder_balance, last_reminder_sent_at, kickoff_completed_at, created_at")
      .eq("id", projectId)
      .maybeSingle<{
        reminder_balance: number;
        last_reminder_sent_at: string | null;
        kickoff_completed_at: string | null;
        created_at: string;
      }>();

    if (projectError) {
      throw new Error(`Failed to read project reminder state: ${projectError.message}`);
    }
    if (!project || !project.kickoff_completed_at || project.reminder_balance <= 0) {
      return null;
    }

    const { data: latestUpdate, error: updateError } = await this.supabase
      .from("project_updates")
      .select("created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>();
    if (updateError) {
      throw new Error(`Failed to read latest project update for reminder: ${updateError.message}`);
    }

    const lastMeaningfulActivity = latestUpdate?.created_at ?? project.created_at;
    if (new Date(lastMeaningfulActivity).toISOString() > idleThresholdIso) {
      return null;
    }

    if (project.last_reminder_sent_at && new Date(project.last_reminder_sent_at).toISOString() > idleThresholdIso) {
      return null;
    }

    const nextBalance = Math.max(0, project.reminder_balance - 1);
    let updateQuery = this.supabase
      .from("projects")
      .update({
        reminder_balance: nextBalance,
        last_reminder_sent_at: nowIso,
      })
      .eq("id", projectId)
      .eq("reminder_balance", project.reminder_balance);

    if (project.last_reminder_sent_at) {
      updateQuery = updateQuery.eq("last_reminder_sent_at", project.last_reminder_sent_at);
    } else {
      updateQuery = updateQuery.is("last_reminder_sent_at", null);
    }

    const { data: reservedProject, error: reserveError } = await updateQuery.select("id").maybeSingle<{ id: string }>();
    if (reserveError) {
      throw new Error(`Failed to reserve reminder slot: ${reserveError.message}`);
    }
    if (!reservedProject) {
      return null;
    }

    return nowIso;
  }

  async releaseReminderSlot(projectId: string, reservationTimestamp: string): Promise<void> {
    const { data: project, error: projectError } = await this.supabase
      .from("projects")
      .select("reminder_balance, last_reminder_sent_at")
      .eq("id", projectId)
      .maybeSingle<{ reminder_balance: number; last_reminder_sent_at: string | null }>();
    if (projectError) {
      throw new Error(`Failed to read reminder reservation: ${projectError.message}`);
    }
    if (!project || project.last_reminder_sent_at !== reservationTimestamp) {
      return;
    }

    const { error } = await this.supabase
      .from("projects")
      .update({
        reminder_balance: Math.max(0, (project.reminder_balance ?? 0) + 1),
        last_reminder_sent_at: null,
      })
      .eq("id", projectId)
      .eq("reminder_balance", project.reminder_balance)
      .eq("last_reminder_sent_at", reservationTimestamp);
    if (error) {
      throw new Error(`Failed to release reminder reservation: ${error.message}`);
    }
  }

  async recordReminderSent(projectId: string): Promise<void> {
    const { data: row, error: fetchError } = await this.supabase
      .from("projects")
      .select("reminder_balance")
      .eq("id", projectId)
      .maybeSingle<{ reminder_balance: number }>();

    if (fetchError) {
      throw new Error(`Failed to read reminder balance: ${fetchError.message}`);
    }

    const next = Math.max(0, (row?.reminder_balance ?? 0) - 1);
    const { error } = await this.supabase
      .from("projects")
      .update({
        reminder_balance: next,
        last_reminder_sent_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    if (error) {
      throw new Error(`Failed to record reminder send: ${error.message}`);
    }
  }

  async storeTransactionEvent(projectId: string, fromEmail: string, event: TransactionEvent): Promise<void> {
    const { error } = await this.supabase.rpc("store_transaction_event_atomic", {
      p_project_id: projectId,
      p_created_by_email: normalizeEmail(fromEmail),
      p_type: "hourPurchase",
      p_hours_purchased: event.hoursPurchased,
      p_hourly_rate: event.hourlyRate,
      p_allocated_hours: event.allocatedHours,
      p_buffer_hours: event.bufferHours,
      p_saas2_fee: event.saas2Fee,
      p_project_remainder: event.projectRemainder,
    });

    if (error) {
      throw new Error(`Failed to store transaction event atomically: ${error.message}`);
    }
  }

  async getUserProfile(userId: string): Promise<UserProfileContext> {
    const { data, error } = await this.supabase
      .from("user_profiles")
      .select(
        "communication_style, preferences, constraints, onboarding_data, sales_call_transcripts, long_term_instructions, behavior_modifiers, context",
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
        context: unknown;
      }>();

    if (error) {
      throw new Error(`Failed to load user profile: ${error.message}`);
    }

    if (!data) {
      return emptyProfile();
    }

    return rowToUserProfileContext(data);
  }

  async getProjectState(projectId: string): Promise<ProjectContext> {
    const { data: state, error: stateError } = await this.supabase
      .from("project_states")
      .select(
        "project_id, summary, initial_summary, current_status, goals, action_items, completed_tasks, decisions, risks, recommendations, notes, recent_updates",
      )
      .eq("project_id", projectId)
      .maybeSingle<{
        project_id: string;
        summary: string;
        initial_summary: string;
        current_status: string;
        goals: unknown;
        action_items: unknown;
        completed_tasks: unknown;
        decisions: unknown;
        risks: unknown;
        recommendations: unknown;
        notes: unknown;
        recent_updates: unknown;
      }>();

    if (stateError) {
      throw new Error(`Failed to load project state: ${stateError.message}`);
    }

    const { data: project, error: projectError } = await this.supabase
      .from("projects")
      .select(
        "id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, participant_emails, project_domain",
      )
      .eq("id", projectId)
      .single<{
        id: string;
        user_id: string;
        owner_email: string | null;
        name: string;
        status: ProjectStatus;
        project_code: string;
        remainder_balance: number;
        reminder_balance: number;
        usage_count: number;
        participant_emails: unknown;
        project_domain: string | null;
      }>();

    if (projectError || !project) {
      throw new Error(`Failed to load project: ${projectError?.message ?? "Unknown error"}`);
    }

    const { data: userRow, error: userTierError } = await this.supabase
      .from("users")
      .select("tier, email, display_name")
      .eq("id", project.user_id)
      .maybeSingle<{ tier: Tier; email: string | null; display_name: string | null }>();

    if (userTierError) {
      throw new Error(`Failed to load user tier: ${userTierError.message}`);
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

    const tier = userRow?.tier ?? "freemium";
    const entitlements = resolvePlanEntitlements(tier);
    const projectDomain = parseStoredProjectDomain(project.project_domain ?? undefined);
    return {
      projectId: project.id,
      userId: project.user_id,
      projectCode: typeof project.project_code === "string" ? project.project_code : undefined,
      ...(projectDomain ? { projectDomain } : {}),
      projectName: typeof project.name === "string" ? project.name : undefined,
      projectStatus: normalizeProjectStatus(project.status),
      ownerDisplayName: userRow?.display_name?.trim() ? userRow.display_name : undefined,
      ownerEmail:
        typeof project.owner_email === "string" && project.owner_email.trim()
          ? project.owner_email.toLowerCase()
          : userRow?.email?.trim()
            ? userRow.email.toLowerCase()
            : undefined,
      summary: state?.summary ?? "",
      initialSummary: typeof state?.initial_summary === "string" ? state.initial_summary : "",
      currentStatus: typeof state?.current_status === "string" ? state.current_status : "",
      goals: asStringArray(state?.goals),
      actionItems: asStringArray(state?.action_items),
      completedTasks: asStringArray(state?.completed_tasks),
      decisions: asStringArray(state?.decisions),
      risks: asStringArray(state?.risks),
      recommendations: asStringArray(state?.recommendations),
      notes: asStringArray(state?.notes),
      participants: asStringArray(project?.participant_emails),
      recentUpdatesLog: asStringArray(state?.recent_updates),
      remainderBalance: Number(project.remainder_balance ?? 0),
      reminderBalance: Number(project.reminder_balance ?? 0),
      usageCount: Number(project.usage_count ?? 0),
      tier,
      planPackage: entitlements.package,
      featureFlags: {
        collaborators: entitlements.allowCollaborators,
        oversight: entitlements.allowHumanOversight,
      },
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

    const { error: versionError } = await this.supabase.from("project_versions").insert({
      project_id: projectId,
      snapshot: context as unknown as Record<string, unknown>,
    });
    if (versionError) {
      throw new Error(`Failed to record project version: ${versionError.message}`);
    }
  }
}
