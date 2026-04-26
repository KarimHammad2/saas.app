import { getMasterUserEmail } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type {
  CommunicationStyleContext,
  ProjectContext,
  ProjectFollowUp,
  ProjectDomain,
  ProjectStatus,
  RPMSuggestion,
  RPMSuggestionSource,
  Tier,
  TransactionEvent,
  TransactionPaymentMeta,
  TransactionRecord,
  UserProfileContext,
  UserProfileStructuredContext,
} from "@/modules/contracts/types";
import { emptyUserProfileContext } from "@/modules/contracts/types";
import { mergeUniqueStringsPreserveOrder, normalizeListItemKey } from "@/modules/domain/mergeUniqueStrings";

export { mergeUniqueStringsPreserveOrder } from "@/modules/domain/mergeUniqueStrings";
import { applyApprovedInboundRpmSuggestionToContext } from "@/modules/domain/rpmApprovedProfileContext";
import { deepMergeUserProfileContext, type JsonRecord } from "@/modules/domain/userProfileMerge";
import { parseSowSignalsFromUnknown } from "@/modules/domain/sowSignalsPatch";
import { normalizeMessageId } from "@/modules/email/messageId";
import { isIgnoredNoteInput } from "@/modules/email/noteInputValidation";
import { resolvePlanEntitlements } from "@/modules/domain/entitlements";
import { normalizeFollowUpKey } from "@/modules/domain/followUps";
import { normalizeProjectNameCandidate } from "@/modules/domain/projectName";
import { normalizeTaskMatchKey } from "@/modules/domain/taskLabels";
import { parseStoredProjectDomain } from "@/modules/domain/projectDomain";
import { compactOverviewForDocument } from "@/modules/output/overviewText";
import { planAgencyRpmReplacement } from "@/modules/domain/agencyTierRpm";
import { applyTierFinancials } from "@/modules/domain/financial";
import { resolvePaymentLinkForTotal } from "@/modules/domain/paymentLinkCatalog";

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
  last_contact_at: string | null;
  archived_at?: string | null;
  created_at: string;
  created_by_email?: string | null;
  created_by_user_id?: string | null;
}

export interface ClaimedInboundEmailJob {
  id: string;
  emailId: string;
  provider: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface CcMembershipConfirmationRecord {
  id: string;
  owner_user_id: string;
  project_id: string | null;
  owner_email: string;
  candidate_emails: string[];
  status: "pending" | "approved" | "rejected" | "expired";
  source_inbound_event_id: string | null;
  source_subject: string;
  source_raw_body: string;
  resolved_by_email: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AdminEmailActionRecord {
  id: string;
  sender_user_id: string;
  sender_email: string;
  action_kind: string;
  action_payload: Record<string, unknown>;
  status: "pending" | "executed" | "expired";
  source_subject: string;
  source_raw_body: string;
  resolved_by_email: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface EscalationLogRecord {
  id: string;
  project_id: string | null;
  type: string;
  reason: string;
  created_at: string;
}

export interface ReviewFlagRecord {
  id: string;
  project_id: string;
  reason: string;
  status: "pending_review" | "resolved";
  resolved_by_email: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface PendingApprovalRecord {
  id: string;
  action: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired";
  rpm_email: string;
  project_id: string | null;
  requested_by_email: string | null;
  source_subject: string;
  source_raw_body: string;
  resolved_by_email: string | null;
  resolved_at: string | null;
  created_at: string;
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

export class AdditionalEmailConflictError extends Error {
  readonly email: string;

  constructor(email: string) {
    super(`Email ${email} is already associated with another account.`);
    this.name = "AdditionalEmailConflictError";
    this.email = email;
  }
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

function noteSemanticKey(line: string): string {
  const t = line.trim();
  const withoutDate = t.replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, "");
  return normalizeListItemKey(withoutDate);
}

function normalizeSuggestionContentKey(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}

function computeTransactionPaymentMeta(event: TransactionEvent): TransactionPaymentMeta {
  const paymentTotal = Number((event.hoursPurchased * event.hourlyRate).toFixed(2));
  const currency = event.rateCurrency === "cad" ? "cad" : "usd";
  const resolved = resolvePaymentLinkForTotal(paymentTotal, currency);
  return {
    paymentTotal,
    paymentCurrency: resolved.currency,
    paymentLinkUrl: resolved.url,
    paymentLinkTierAmount: resolved.tierAmount,
  };
}

function buildProtectedTransactionSuggestionContent(proposerEmail: string, event: TransactionEvent): string {
  return [
    "[PROTECTED_UPDATE:TRANSACTION]",
    `Proposed by: ${normalizeEmail(proposerEmail)}`,
    `Hours Purchased: ${event.hoursPurchased}`,
    `Hourly Rate: ${event.hourlyRate}`,
    "Reply with approve or reject to confirm this transaction (or approve suggestion <id> if you prefer).",
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
  const hoursPurchased = getNumber("Hours Purchased") ?? getNumber("Hours");
  const hourlyRate = getNumber("Hourly Rate") ?? getNumber("Rate");

  if (!proposerEmail || hoursPurchased === null || hourlyRate === null) {
    return null;
  }

  return {
    proposerEmail,
    event: {
      hoursPurchased,
      hourlyRate,
      allocatedHours: 0,
      bufferHours: 0,
      saas2Fee: 0,
      projectRemainder: 0,
    },
  };
}

type TransactionSelectRow = {
  id: string;
  type: string;
  hours_purchased: number | null;
  hourly_rate: number | null;
  allocated_hours: number | null;
  buffer_hours: number | null;
  saas2_fee: number | null;
  project_remainder: number | null;
  created_at: string;
  payment_total: number | null;
  payment_currency: string | null;
  payment_link_url: string | null;
  payment_link_tier_amount: number | null;
  paid_at: string | null;
  status: string | null;
};

type FollowUpSelectRow = {
  id: string;
  project_id: string;
  action: string;
  target: string;
  when_text: string;
  due_date: string | null;
  status: string;
  created_at: string;
};

function normalizeTransactionPaymentStatus(raw: string | null | undefined): TransactionRecord["paymentStatus"] {
  if (raw === "paid" || raw === "cancelled" || raw === "pending_payment") {
    return raw;
  }
  return "pending_payment";
}

function mapTransactionRowToRecord(row: TransactionSelectRow): TransactionRecord {
  return {
    id: row.id,
    type: row.type as TransactionRecord["type"],
    hoursPurchased: Number(row.hours_purchased ?? 0),
    hourlyRate: Number(row.hourly_rate ?? 0),
    allocatedHours: Number(row.allocated_hours ?? 0),
    bufferHours: Number(row.buffer_hours ?? 0),
    saas2Fee: Number(row.saas2_fee ?? 0),
    projectRemainder: Number(row.project_remainder ?? 0),
    createdAt: row.created_at,
    paymentTotal: Number(row.payment_total ?? 0),
    paymentCurrency: typeof row.payment_currency === "string" ? row.payment_currency : "usd",
    paymentLinkUrl: typeof row.payment_link_url === "string" ? row.payment_link_url : null,
    paymentLinkTierAmount:
      row.payment_link_tier_amount === null || row.payment_link_tier_amount === undefined
        ? null
        : Number(row.payment_link_tier_amount),
    paidAt: typeof row.paid_at === "string" ? row.paid_at : null,
    paymentStatus: normalizeTransactionPaymentStatus(row.status),
  };
}

const PROJECT_SELECT_COLUMNS =
  "id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, kickoff_completed_at, last_contact_at, archived_at, created_at";
const PROJECT_SELECT_COLUMNS_WITH_CREATOR = `${PROJECT_SELECT_COLUMNS}, created_by_email, created_by_user_id`;

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

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) {
      return null;
    }

    const { data, error } = await this.supabase
      .from("users")
      .select("id, email, display_name, tier, created_at")
      .eq("email", normalized)
      .maybeSingle<UserRecord>();

    if (error) {
      throw new Error(`Failed to look up user by email: ${error.message}`);
    }

    return data ?? null;
  }

  async listUsers(limit = 25): Promise<UserRecord[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 25;
    const { data, error } = await this.supabase
      .from("users")
      .select("id, email, display_name, tier, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    return (data ?? []) as UserRecord[];
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
      const { data: existing, error: existingError } = await this.supabase
        .from("user_emails")
        .select("user_id")
        .eq("email", email)
        .maybeSingle<{ user_id: string }>();
      if (existingError) {
        throw new Error(`Failed to validate user email ownership: ${existingError.message}`);
      }
      if (existing?.user_id && existing.user_id !== userId) {
        throw new AdditionalEmailConflictError(email);
      }

      const { error: upsertError } = await this.supabase.from("user_emails").upsert(
        {
          user_id: userId,
          email,
          is_primary: false,
        },
        { onConflict: "user_id,email" },
      );
      if (upsertError) {
        throw new Error(`Failed to add account email ${email}: ${upsertError.message}`);
      }
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

  async addProjectMembersByEmails(projectId: string, ownerUserId: string, emails: string[]): Promise<string[]> {
    const normalized = Array.from(
      new Set(
        emails
          .map(normalizeEmail)
          .filter((email) => isEmail(email)),
      ),
    );
    if (normalized.length === 0) {
      return [];
    }

    const { data: rows, error: lookupError } = await this.supabase
      .from("user_emails")
      .select("email, user_id")
      .in("email", normalized);
    if (lookupError) {
      throw new Error(`Failed to look up member emails: ${lookupError.message}`);
    }

    const distinctMemberIds = Array.from(
      new Set(
        (rows ?? [])
          .map((row) => String(row.user_id))
          .filter((memberId) => Boolean(memberId) && memberId !== ownerUserId),
      ),
    );
    if (distinctMemberIds.length === 0) {
      return [];
    }

    for (const memberId of distinctMemberIds) {
      const { error } = await this.supabase.from("project_members").upsert(
        {
          project_id: projectId,
          user_id: memberId,
          role: "member",
        },
        { onConflict: "project_id,user_id" },
      );
      if (error) {
        throw new Error(`Failed to upsert project member ${memberId}: ${error.message}`);
      }
    }
    return distinctMemberIds;
  }

  async setUserTier(userId: string, tier: Tier): Promise<void> {
    const { error } = await this.supabase.from("users").update({ tier }).eq("id", userId);
    if (error) {
      throw new Error(`Failed to update user tier: ${error.message}`);
    }
  }

  async createOrReusePendingCcMembershipConfirmation(input: {
    ownerUserId: string;
    projectId?: string | null;
    ownerEmail: string;
    candidateEmails: string[];
    sourceInboundEventId?: string | null;
    sourceSubject: string;
    sourceRawBody: string;
  }): Promise<CcMembershipConfirmationRecord> {
    const normalizedCandidates = Array.from(
      new Set(input.candidateEmails.map(normalizeEmail).filter((email) => isEmail(email))),
    );
    const normalizedOwner = normalizeEmail(input.ownerEmail);
    const { data: pendingRows, error: pendingError } = await this.supabase
      .from("cc_membership_confirmations")
      .select(
        "id, owner_user_id, project_id, owner_email, candidate_emails, status, source_inbound_event_id, source_subject, source_raw_body, resolved_by_email, resolved_at, created_at",
      )
      .eq("owner_user_id", input.ownerUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);
    if (pendingError) {
      throw new Error(`Failed to load pending CC confirmations: ${pendingError.message}`);
    }

    const matching = (pendingRows ?? []).find((row) => {
      const rowCandidates = asStringArray(row.candidate_emails).map(normalizeEmail).sort();
      const nextCandidates = [...normalizedCandidates].sort();
      return rowCandidates.length === nextCandidates.length && rowCandidates.every((entry, idx) => entry === nextCandidates[idx]);
    });
    if (matching) {
      return {
        id: matching.id,
        owner_user_id: matching.owner_user_id,
        project_id: matching.project_id,
        owner_email: matching.owner_email,
        candidate_emails: asStringArray(matching.candidate_emails),
        status: matching.status,
        source_inbound_event_id: matching.source_inbound_event_id,
        source_subject: matching.source_subject ?? "",
        source_raw_body: matching.source_raw_body ?? "",
        resolved_by_email: matching.resolved_by_email,
        resolved_at: matching.resolved_at,
        created_at: matching.created_at,
      };
    }

    const { data: created, error: createError } = await this.supabase
      .from("cc_membership_confirmations")
      .insert({
        owner_user_id: input.ownerUserId,
        project_id: input.projectId ?? null,
        owner_email: normalizedOwner,
        candidate_emails: normalizedCandidates,
        status: "pending",
        source_inbound_event_id: input.sourceInboundEventId ?? null,
        source_subject: input.sourceSubject,
        source_raw_body: input.sourceRawBody,
      })
      .select(
        "id, owner_user_id, project_id, owner_email, candidate_emails, status, source_inbound_event_id, source_subject, source_raw_body, resolved_by_email, resolved_at, created_at",
      )
      .single<CcMembershipConfirmationRecord>();
    if (createError || !created) {
      throw new Error(`Failed to create CC membership confirmation: ${createError?.message ?? "Unknown error"}`);
    }
    return { ...created, candidate_emails: asStringArray(created.candidate_emails) };
  }

  async findLatestPendingCcMembershipConfirmation(ownerUserId: string): Promise<CcMembershipConfirmationRecord | null> {
    const { data, error } = await this.supabase
      .from("cc_membership_confirmations")
      .select(
        "id, owner_user_id, project_id, owner_email, candidate_emails, status, source_inbound_event_id, source_subject, source_raw_body, resolved_by_email, resolved_at, created_at",
      )
      .eq("owner_user_id", ownerUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<CcMembershipConfirmationRecord>();
    if (error) {
      throw new Error(`Failed to load pending CC membership confirmation: ${error.message}`);
    }
    if (!data) {
      return null;
    }
    return { ...data, candidate_emails: asStringArray(data.candidate_emails) };
  }

  async resolveCcMembershipConfirmation(input: {
    confirmationId: string;
    status: "approved" | "rejected" | "expired";
    resolvedByEmail: string;
  }): Promise<void> {
    const { error } = await this.supabase
      .from("cc_membership_confirmations")
      .update({
        status: input.status,
        resolved_by_email: normalizeEmail(input.resolvedByEmail),
        resolved_at: new Date().toISOString(),
      })
      .eq("id", input.confirmationId)
      .eq("status", "pending");
    if (error) {
      throw new Error(`Failed to resolve CC membership confirmation: ${error.message}`);
    }
  }

  async createOrReusePendingAdminAction(input: {
    senderUserId: string;
    senderEmail: string;
    actionKind: string;
    actionPayload: Record<string, unknown>;
    sourceSubject: string;
    sourceRawBody: string;
  }): Promise<AdminEmailActionRecord> {
    const normalizedSender = normalizeEmail(input.senderEmail);
    if (!isEmail(normalizedSender)) {
      throw new Error("A valid sender email is required.");
    }

    await this.supabase
      .from("admin_email_actions")
      .update({
        status: "expired",
        resolved_by_email: normalizedSender,
        resolved_at: new Date().toISOString(),
      })
      .eq("sender_user_id", input.senderUserId)
      .eq("status", "pending");

    const { data, error } = await this.supabase
      .from("admin_email_actions")
      .insert({
        sender_user_id: input.senderUserId,
        sender_email: normalizedSender,
        action_kind: input.actionKind,
        action_payload: input.actionPayload,
        status: "pending",
        source_subject: input.sourceSubject,
        source_raw_body: input.sourceRawBody,
      })
      .select(
        "id, sender_user_id, sender_email, action_kind, action_payload, status, source_subject, source_raw_body, resolved_by_email, resolved_at, created_at",
      )
      .single<AdminEmailActionRecord>();

    if (error || !data) {
      throw new Error(`Failed to create admin email action: ${error?.message ?? "Unknown error"}`);
    }

    return {
      ...data,
      action_payload:
        data.action_payload && typeof data.action_payload === "object" && !Array.isArray(data.action_payload)
          ? (data.action_payload as Record<string, unknown>)
          : {},
    };
  }

  async findLatestPendingAdminAction(senderUserId: string): Promise<AdminEmailActionRecord | null> {
    const { data, error } = await this.supabase
      .from("admin_email_actions")
      .select(
        "id, sender_user_id, sender_email, action_kind, action_payload, status, source_subject, source_raw_body, resolved_by_email, resolved_at, created_at",
      )
      .eq("sender_user_id", senderUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<AdminEmailActionRecord>();

    if (error) {
      throw new Error(`Failed to load pending admin action: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      ...data,
      action_payload:
        data.action_payload && typeof data.action_payload === "object" && !Array.isArray(data.action_payload)
          ? (data.action_payload as Record<string, unknown>)
          : {},
    };
  }

  async resolvePendingAdminAction(input: {
    actionId: string;
    status: "executed" | "expired";
    resolvedByEmail: string;
  }): Promise<void> {
    const { error } = await this.supabase
      .from("admin_email_actions")
      .update({
        status: input.status,
        resolved_by_email: normalizeEmail(input.resolvedByEmail),
        resolved_at: new Date().toISOString(),
      })
      .eq("id", input.actionId)
      .eq("status", "pending");

    if (error) {
      throw new Error(`Failed to resolve admin email action: ${error.message}`);
    }
  }

  async createEscalationLog(input: {
    projectId?: string | null;
    type: string;
    reason: string;
  }): Promise<EscalationLogRecord> {
    const { data, error } = await this.supabase
      .from("escalation_logs")
      .insert({
        project_id: input.projectId ?? null,
        type: input.type,
        reason: input.reason,
      })
      .select("id, project_id, type, reason, created_at")
      .single<EscalationLogRecord>();
    if (error || !data) {
      throw new Error(`Failed to create escalation log: ${error?.message ?? "Unknown error"}`);
    }
    return data;
  }

  async createReviewFlag(input: { projectId: string; reason: string }): Promise<ReviewFlagRecord> {
    const { data, error } = await this.supabase
      .from("review_flags")
      .insert({
        project_id: input.projectId,
        reason: input.reason,
        status: "pending_review",
      })
      .select("id, project_id, reason, status, resolved_by_email, resolved_at, created_at")
      .single<ReviewFlagRecord>();
    if (error || !data) {
      throw new Error(`Failed to create review flag: ${error?.message ?? "Unknown error"}`);
    }
    return data;
  }

  async createPendingApproval(input: {
    action: string;
    reason: string;
    status: "pending";
    rpmEmail: string;
    projectId?: string | null;
    requestedByEmail?: string | null;
    sourceSubject?: string;
    sourceRawBody?: string;
  }): Promise<PendingApprovalRecord> {
    const { data, error } = await this.supabase
      .from("pending_human_approvals")
      .insert({
        action: input.action,
        reason: input.reason,
        status: input.status,
        rpm_email: input.rpmEmail,
        project_id: input.projectId ?? null,
        requested_by_email: input.requestedByEmail ?? null,
        source_subject: input.sourceSubject ?? "",
        source_raw_body: input.sourceRawBody ?? "",
      })
      .select(
        "id, action, reason, status, rpm_email, project_id, requested_by_email, source_subject, source_raw_body, resolved_by_email, resolved_at, created_at",
      )
      .single<PendingApprovalRecord>();
    if (error || !data) {
      throw new Error(`Failed to create pending approval: ${error?.message ?? "Unknown error"}`);
    }
    return data;
  }

  async findLatestPendingApproval(rpmEmail: string): Promise<PendingApprovalRecord | null> {
    const normalized = normalizeEmail(rpmEmail);
    const { data, error } = await this.supabase
      .from("pending_human_approvals")
      .select(
        "id, action, reason, status, rpm_email, project_id, requested_by_email, source_subject, source_raw_body, resolved_by_email, resolved_at, created_at",
      )
      .eq("rpm_email", normalized)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PendingApprovalRecord>();
    if (error) {
      throw new Error(`Failed to load pending human approval: ${error.message}`);
    }
    return data ?? null;
  }

  async resolvePendingApproval(input: {
    approvalId: string;
    status: "approved" | "rejected" | "expired";
    resolvedByEmail: string;
  }): Promise<void> {
    const { error } = await this.supabase
      .from("pending_human_approvals")
      .update({
        status: input.status,
        resolved_by_email: normalizeEmail(input.resolvedByEmail),
        resolved_at: new Date().toISOString(),
      })
      .eq("id", input.approvalId)
      .eq("status", "pending");
    if (error) {
      throw new Error(`Failed to resolve pending approval: ${error.message}`);
    }
  }

  async findProjectById(projectId: string): Promise<ProjectRecord | null> {
    const { data, error } = await this.supabase
      .from("projects")
      .select(PROJECT_SELECT_COLUMNS)
      .eq("id", projectId)
      .maybeSingle<ProjectRecord>();
    if (error) {
      throw new Error(`Failed to load project by id: ${error.message}`);
    }
    return data ?? null;
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
      .select(PROJECT_SELECT_COLUMNS)
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
      .select(PROJECT_SELECT_COLUMNS)
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
      .select(PROJECT_SELECT_COLUMNS)
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
      .select(PROJECT_SELECT_COLUMNS)
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
      .select(PROJECT_SELECT_COLUMNS)
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
      .select(PROJECT_SELECT_COLUMNS)
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

  async getUserEmailsById(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("user_emails")
      .select("email")
      .eq("user_id", userId);
    if (error) {
      throw new Error(`Failed to load user emails: ${error.message}`);
    }
    return Array.from(
      new Set(
        (data ?? [])
          .map((row) => normalizeEmail(String(row.email ?? "")))
          .filter((email) => isEmail(email)),
      ),
    );
  }

  async findProjectsOwnedByUser(userId: string): Promise<ProjectRecord[]> {
    const { data, error } = await this.supabase
      .from("projects")
      .select(PROJECT_SELECT_COLUMNS)
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
      .select(PROJECT_SELECT_COLUMNS)
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
  async createProjectForUser(
    userId: string,
    name = "New Project",
    options?: { createdByEmail?: string; createdByUserId?: string | null },
  ): Promise<{ project: ProjectRecord; created: boolean }> {
    const ownerEmail = await this.getUserEmailById(userId);
    if (!ownerEmail) {
      throw new Error("Failed to resolve owner email for project creation.");
    }
    const trimmed = name.trim() || "New Project";
    const insertRow: Record<string, unknown> = {
      user_id: userId,
      owner_email: ownerEmail,
      name: trimmed.slice(0, 200),
      status: "active",
    };
    if (options?.createdByEmail) {
      const n = normalizeEmail(options.createdByEmail);
      if (isEmail(n)) {
        insertRow.created_by_email = n;
      }
    }
    if (options?.createdByUserId) {
      insertRow.created_by_user_id = options.createdByUserId;
    }
    const { data: created, error: createError } = await this.supabase
      .from("projects")
      .insert(insertRow)
      .select(PROJECT_SELECT_COLUMNS_WITH_CREATOR)
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

  async updateProjectLastContactAt(projectId: string, lastContactAt = new Date().toISOString()): Promise<string> {
    const normalized = lastContactAt.trim();
    if (!normalized) {
      return "";
    }

    const { error } = await this.supabase.from("projects").update({ last_contact_at: normalized }).eq("id", projectId);
    if (error) {
      throw new Error(`Failed to update project last contact: ${error.message}`);
    }
    return normalized;
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

  async deactivateActiveRpm(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from("rpm_assignments")
      .update({ is_active: false })
      .eq("project_id", projectId)
      .eq("is_active", true);

    if (error) {
      throw new Error(`Failed to deactivate RPM assignment: ${error.message}`);
    }
  }

  async getAgencyDefaultRpmEmail(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("users")
      .select("agency_default_rpm_email")
      .eq("id", userId)
      .maybeSingle<{ agency_default_rpm_email: string | null }>();

    if (error) {
      throw new Error(`Failed to load agency default RPM: ${error.message}`);
    }

    const raw = data?.agency_default_rpm_email?.trim();
    if (!raw) {
      return null;
    }
    const normalized = normalizeEmail(raw);
    return isEmail(normalized) ? normalized : null;
  }

  async setAgencyDefaultRpmEmail(userId: string, email: string | null): Promise<void> {
    const normalized =
      email === null || email.trim() === ""
        ? null
        : normalizeEmail(email);
    if (normalized && !isEmail(normalized)) {
      throw new Error("Agency default RPM email must be a valid email.");
    }

    const { error } = await this.supabase
      .from("users")
      .update({ agency_default_rpm_email: normalized })
      .eq("id", userId);

    if (error) {
      throw new Error(`Failed to set agency default RPM: ${error.message}`);
    }
  }

  /**
   * When an account becomes agency: remove master user (Daniel) as operational RPM on all owned projects.
   * Uses `agency_default_rpm_email` when set; otherwise clears the active RPM row.
   */
  async applyAgencyTierRpmTransition(userId: string): Promise<void> {
    const master = getMasterUserEmail().trim().toLowerCase();
    const agencyDefault = await this.getAgencyDefaultRpmEmail(userId);
    const projects = await this.findProjectsOwnedByUser(userId);
    for (const p of projects) {
      const active = await this.getActiveRpm(p.id);
      const plan = planAgencyRpmReplacement(master, active, agencyDefault);
      if (plan === "noop") {
        continue;
      }
      if (plan === "assign" && agencyDefault) {
        await this.assignRpm(p.id, agencyDefault, "system@saas2.local");
      } else {
        await this.deactivateActiveRpm(p.id);
      }
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

  async storeFollowUps(
    projectId: string,
    followUps: ProjectFollowUp[],
    sourceInboundEventId?: string | null,
  ): Promise<void> {
    const normalized = followUps
      .map((followUp) => ({
        action: followUp.action.replace(/\s+/g, " ").trim(),
        target: followUp.target.replace(/\s+/g, " ").trim(),
        whenText: followUp.whenText.replace(/\s+/g, " ").trim(),
        dueDate: followUp.dueDate ?? null,
        status: followUp.status === "done" ? "done" : "pending",
      }))
      .filter((followUp) => followUp.action.length > 0);

    if (normalized.length === 0) {
      return;
    }

    const { data: existing, error: fetchError } = await this.supabase
      .from("followups")
      .select("action, target, when_text, due_date, status")
      .eq("project_id", projectId)
      .eq("status", "pending");

    if (fetchError) {
      throw new Error(`Failed to read existing follow-ups: ${fetchError.message}`);
    }

    const existingRows = (existing ?? []) as FollowUpSelectRow[];
    const seen = new Set<string>(
      existingRows.map((row) =>
        normalizeFollowUpKey({
          action: row.action,
          target: row.target,
          whenText: row.when_text,
          dueDate: row.due_date,
        }),
      ),
    );

    const rows: Array<Record<string, unknown>> = [];
    for (const followUp of normalized) {
      const key = normalizeFollowUpKey(followUp);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      rows.push({
        project_id: projectId,
        action: followUp.action,
        target: followUp.target,
        when_text: followUp.whenText,
        due_date: followUp.dueDate,
        status: followUp.status,
        source_inbound_event_id: sourceInboundEventId ?? null,
      });
    }

    if (rows.length === 0) {
      return;
    }

    const { error } = await this.supabase.from("followups").insert(rows);
    if (error) {
      throw new Error(`Failed to store follow-ups: ${error.message}`);
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

  /** Full replace of in-progress tasks (Tasks: / Action Items: from RPM). Allows empty array to clear. */
  async replaceActionItems(projectId: string, items: string[]): Promise<void> {
    const normalized = items.map((i) => i.trim()).filter(Boolean);
    const { error } = await this.supabase
      .from("project_states")
      .update({ action_items: normalized, tasks: normalized })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to replace action items: ${error.message}`);
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

  /** Full replace of goals (e.g. labeled Goals: section). Allows empty array to clear. */
  async replaceGoals(projectId: string, goals: string[]): Promise<void> {
    const normalized = goals.map((g) => g.trim()).filter(Boolean);
    const { error } = await this.supabase.from("project_states").update({ goals: normalized }).eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to replace goals: ${error.message}`);
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

  /**
   * Approved inbound RPM profile suggestion: replace `longTermInstructions` and `sowSignals` with this
   * suggestion only (does not append to prior instructions or merge structured fields).
   */
  async applyApprovedInboundRpmSuggestion(userId: string, suggestionContent: string): Promise<void> {
    const trimmed = suggestionContent.trim();
    if (!trimmed) {
      return;
    }
    const base = await this.readNormalizedContextJson(userId);
    const next = applyApprovedInboundRpmSuggestionToContext(base, suggestionContent);
    await this.persistContextJson(userId, next);
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

  async approveSuggestion(
    userId: string,
    suggestionId: string,
    approverEmail: string,
  ): Promise<{ event: TransactionEvent; payment: TransactionPaymentMeta } | null> {
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
      return null;
    }

    if (suggestion.status !== "pending") {
      return null;
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
      const { data: userRow } = await this.supabase
        .from("users")
        .select("tier")
        .eq("id", userId)
        .maybeSingle<{ tier: Tier }>();
      const tier = userRow?.tier ?? "freemium";
      const normalized = applyTierFinancials(protectedTransaction.event, tier);
      const payment = await this.storeTransactionEvent(suggestion.project_id, protectedTransaction.proposerEmail, normalized);
      await this.appendRecentUpdate(
        suggestion.project_id,
        `Protected transaction approved [${suggestion.id}] by ${normalizeEmail(approverEmail)} (proposed by ${protectedTransaction.proposerEmail})`,
      );
      return { event: normalized, payment };
    }

    if (suggestion.source === "inbound") {
      await this.applyApprovedInboundRpmSuggestion(userId, suggestion.content);
    }
    return null;
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

  /**
   * Records a new financial event as an **append-only** row in `public.transactions`.
   * Prior transaction rows are never updated, merged, or overwritten by this call.
   * The `store_transaction_event_atomic` RPC then adds `event.projectRemainder` to the
   * project's `remainder_balance` (running total), so each new purchase stacks on the last balance.
   */
  async storeTransactionEvent(
    projectId: string,
    fromEmail: string,
    event: TransactionEvent,
  ): Promise<TransactionPaymentMeta> {
    const payment = computeTransactionPaymentMeta(event);
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
      p_status: "pending_payment",
      p_payment_total: payment.paymentTotal,
      p_payment_currency: payment.paymentCurrency,
      p_payment_link_url: payment.paymentLinkUrl,
      p_payment_link_tier_amount: payment.paymentLinkTierAmount,
    });

    if (error) {
      throw new Error(`Failed to store transaction event atomically: ${error.message}`);
    }
    return payment;
  }

  /**
   * Sets **one** pending hour-purchase row to `paid` (latest by `created_at`). Does not alter
   * `project_remainder` on that row or other rows; project `remainder_balance` was already
   * updated when the transaction was inserted.
   */
  async markLatestPendingHourPurchasePaid(
    projectId: string,
    _acknowledgedByEmail: string,
  ): Promise<TransactionRecord | null> {
    const { data: latest, error: selErr } = await this.supabase
      .from("transactions")
      .select("id")
      .eq("project_id", projectId)
      .eq("type", "hourPurchase")
      .eq("status", "pending_payment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (selErr) {
      throw new Error(`Failed to find pending hour purchase: ${selErr.message}`);
    }
    if (!latest?.id) {
      return null;
    }

    const paidAtIso = new Date().toISOString();
    const { data: updated, error: updErr } = await this.supabase
      .from("transactions")
      .update({ status: "paid", paid_at: paidAtIso })
      .eq("id", latest.id)
      .eq("status", "pending_payment")
      .select(
        "id, type, hours_purchased, hourly_rate, allocated_hours, buffer_hours, saas2_fee, project_remainder, created_at, payment_total, payment_currency, payment_link_url, payment_link_tier_amount, paid_at, status",
      )
      .maybeSingle<TransactionSelectRow>();

    if (updErr) {
      throw new Error(`Failed to mark hour purchase paid: ${updErr.message}`);
    }
    if (!updated) {
      return null;
    }

    return mapTransactionRowToRecord(updated);
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
        "id, user_id, owner_email, name, status, project_code, remainder_balance, reminder_balance, usage_count, participant_emails, project_domain, last_contact_at",
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
        last_contact_at: string | null;
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

    // One DB row per recorded transaction (insert-only via RPC); full history for the project, newest first.
    const { data: transactions, error: txError } = await this.supabase
      .from("transactions")
      .select(
        "id, type, hours_purchased, hourly_rate, allocated_hours, buffer_hours, saas2_fee, project_remainder, created_at, payment_total, payment_currency, payment_link_url, payment_link_tier_amount, paid_at, status",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (txError) {
      throw new Error(`Failed to load transactions: ${txError.message}`);
    }

    const transactionHistory: TransactionRecord[] = (transactions ?? []).map((row) =>
      mapTransactionRowToRecord(row as TransactionSelectRow),
    );

    const { data: followUps, error: followUpError } = await this.supabase
      .from("followups")
      .select("id, project_id, action, target, when_text, due_date, status, created_at")
      .eq("project_id", projectId)
      .eq("status", "pending")
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (followUpError) {
      throw new Error(`Failed to load follow-ups: ${followUpError.message}`);
    }

    const followUpRecords: ProjectFollowUp[] = (followUps ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      action: row.action,
      target: row.target,
      whenText: row.when_text,
      dueDate: row.due_date,
      status: row.status === "done" ? "done" : "pending",
      createdAt: row.created_at,
    }));

    const tier = userRow?.tier ?? "freemium";
    const entitlements = resolvePlanEntitlements(tier);
    const projectDomain = parseStoredProjectDomain(project.project_domain ?? undefined);
    const activeRpmEmail = await this.getActiveRpm(projectId);
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
      lastContactAt: typeof project.last_contact_at === "string" && project.last_contact_at.trim() ? project.last_contact_at : undefined,
      ...(activeRpmEmail ? { activeRpmEmail: activeRpmEmail.trim().toLowerCase() } : {}),
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
      followUps: followUpRecords,
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

  /**
   * Admin project-by-name resolver. Returns matching rows without scoping to the master account,
   * optionally narrowed to a single owner (by user id). Name comparison is case-insensitive and
   * whitespace-normalized; archived projects are included so `restore_project` can reach them.
   */
  async findProjectsByName(
    input: { name: string; userId?: string | null },
  ): Promise<ProjectRecord[]> {
    const normalized = normalizeProjectNameCandidate(input.name);
    if (!normalized) {
      return [];
    }
    let query = this.supabase.from("projects").select(PROJECT_SELECT_COLUMNS);
    if (input.userId) {
      query = query.eq("user_id", input.userId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to look up projects by name: ${error.message}`);
    }
    const key = normalized.toLowerCase();
    return ((data ?? []) as ProjectRecord[]).filter(
      (row) => (normalizeProjectNameCandidate(row.name) ?? "").toLowerCase() === key,
    );
  }

  async setProjectArchived(projectId: string, archivedAtIso: string | null): Promise<void> {
    const { error } = await this.supabase
      .from("projects")
      .update({ archived_at: archivedAtIso })
      .eq("id", projectId);
    if (error) {
      throw new Error(`Failed to update project archived_at: ${error.message}`);
    }
  }

  /**
   * Build a full before-snapshot for `admin_audit_log.before_json` prior to a hard delete.
   * Captures the project row, its state row, and the currently-assigned RPM email so the
   * delete can be manually reconstructed from the audit log if needed.
   */
  async loadProjectDeletionSnapshot(projectId: string): Promise<Record<string, unknown>> {
    const { data: projectRow, error: projectError } = await this.supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) {
      throw new Error(`Failed to load project snapshot: ${projectError.message}`);
    }

    const { data: stateRow, error: stateError } = await this.supabase
      .from("project_states")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    if (stateError) {
      throw new Error(`Failed to load project state snapshot: ${stateError.message}`);
    }

    const rpmEmail = await this.getActiveRpm(projectId);

    return {
      project: projectRow ?? null,
      state: stateRow ?? null,
      rpmEmail,
    };
  }

  /**
   * Permanently delete a project row. Child tables declare `on delete cascade` on
   * `project_id`, so all dependent rows (updates, transactions, documents, goals,
   * risks, outbound events, escalations, follow-ups, cc-membership confirmations,
   * etc.) are removed by the database in the same statement.
   */
  async hardDeleteProject(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from("projects")
      .delete()
      .eq("id", projectId);
    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  /**
   * Build a full before-snapshot for `admin_audit_log.before_json` prior to a hard user delete.
   * Captures the user row, owned project ids/names, and account email aliases so the deletion
   * can be reconstructed from the audit log if required.
   */
  async loadUserDeletionSnapshot(userId: string): Promise<Record<string, unknown>> {
    const { data: userRow, error: userError } = await this.supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (userError) {
      throw new Error(`Failed to load user snapshot: ${userError.message}`);
    }

    const { data: projectRows, error: projectsError } = await this.supabase
      .from("projects")
      .select("id, name, project_code, status, archived_at")
      .eq("user_id", userId);
    if (projectsError) {
      throw new Error(`Failed to load owned projects snapshot: ${projectsError.message}`);
    }

    const { data: emailRows, error: emailsError } = await this.supabase
      .from("user_emails")
      .select("email, is_primary")
      .eq("user_id", userId);
    if (emailsError) {
      throw new Error(`Failed to load user_emails snapshot: ${emailsError.message}`);
    }

    return {
      user: userRow ?? null,
      projects: projectRows ?? [],
      emails: emailRows ?? [],
    };
  }

  /**
   * Permanently delete a user row. Child tables declare `on delete cascade` on `user_id`
   * (projects, user_emails, user_profiles, project_members, rpm_suggestions,
   * user_profile_context, cc_membership_confirmations, admin_email_actions), so all
   * dependent rows are removed by the database in the same statement. Project-scoped
   * tables are then cascaded a second hop via `projects.user_id`.
   */
  async hardDeleteUser(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from("users")
      .delete()
      .eq("id", userId);
    if (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  async replaceProjectRisks(projectId: string, risks: string[]): Promise<void> {
    const normalized = risks.map((entry) => entry.trim()).filter(Boolean);
    const { error } = await this.supabase
      .from("project_states")
      .update({ risks: normalized })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to replace project risks: ${error.message}`);
    }
  }

  async replaceProjectNotes(projectId: string, notes: string[]): Promise<void> {
    const normalized = notes.map((entry) => entry.trim()).filter(Boolean);
    const { error } = await this.supabase
      .from("project_states")
      .update({ notes: normalized })
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Failed to replace project notes: ${error.message}`);
    }
  }

  async replaceProjectSummary(projectId: string, summary: string): Promise<void> {
    const compact = compactOverviewForDocument(summary);
    const { error } = await this.supabase
      .from("project_states")
      .upsert({ project_id: projectId, summary: compact }, { onConflict: "project_id" });
    if (error) {
      throw new Error(`Failed to replace project summary: ${error.message}`);
    }
  }

  async replaceProjectCurrentStatus(projectId: string, status: string): Promise<void> {
    const trimmed = status.trim();
    const { error } = await this.supabase
      .from("project_states")
      .upsert({ project_id: projectId, current_status: trimmed }, { onConflict: "project_id" });
    if (error) {
      throw new Error(`Failed to replace project current status: ${error.message}`);
    }
  }

  async listProjectUpdates(
    projectId: string,
    limit = 20,
  ): Promise<Array<{ id: string; createdAt: string; contentPreview: string; senderEmail: string | null }>> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
    const { data, error } = await this.supabase
      .from("project_updates")
      .select("id, created_at, content, raw_email")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) {
      throw new Error(`Failed to list project updates: ${error.message}`);
    }
    return ((data ?? []) as Array<{
      id: string;
      created_at: string;
      content: string | null;
      raw_email: Record<string, unknown> | null;
    }>).map((row) => {
      const content = typeof row.content === "string" ? row.content : "";
      const preview = content.replace(/\s+/g, " ").trim();
      const fromValue = row.raw_email && typeof row.raw_email === "object"
        ? (row.raw_email as Record<string, unknown>).from
        : null;
      const senderEmail = typeof fromValue === "string" && fromValue.trim() ? fromValue.trim().toLowerCase() : null;
      return {
        id: row.id,
        createdAt: row.created_at,
        contentPreview: preview.length > 120 ? `${preview.slice(0, 120)}…` : preview || "(empty)",
        senderEmail,
      };
    });
  }

  async listOutboundDocumentEvents(
    projectId: string,
    limit = 20,
  ): Promise<Array<{ id: string; createdAt: string; kind: string; status: string; recipientCount: number }>> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
    const { data, error } = await this.supabase
      .from("outbound_email_events")
      .select("id, created_at, kind, status, recipient_count")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) {
      throw new Error(`Failed to list outbound document events: ${error.message}`);
    }
    return ((data ?? []) as Array<{
      id: string;
      created_at: string;
      kind: string;
      status: string;
      recipient_count: number | null;
    }>).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      kind: row.kind,
      status: row.status,
      recipientCount: Number(row.recipient_count ?? 0),
    }));
  }

  async listSystemSettings(keyPrefix?: string | null): Promise<Array<{ key: string; valueJson: unknown }>> {
    let query = this.supabase
      .from("system_settings")
      .select("key, value_json")
      .order("key", { ascending: true });
    const normalizedPrefix = keyPrefix?.trim();
    if (normalizedPrefix) {
      query = query.ilike("key", `${normalizedPrefix.replace(/[%_]/g, "\\$&")}%`);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list system settings: ${error.message}`);
    }
    return ((data ?? []) as Array<{ key: string; value_json: unknown }>).map((row) => ({
      key: row.key,
      valueJson: row.value_json,
    }));
  }

  async getSystemSetting(key: string): Promise<{ key: string; valueJson: unknown } | null> {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      return null;
    }
    const { data, error } = await this.supabase
      .from("system_settings")
      .select("key, value_json")
      .eq("key", normalizedKey)
      .maybeSingle<{ key: string; value_json: unknown }>();
    if (error) {
      throw new Error(`Failed to read system setting: ${error.message}`);
    }
    if (!data) {
      return null;
    }
    return { key: data.key, valueJson: data.value_json };
  }

  async upsertSystemSetting(key: string, valueJson: unknown): Promise<{ key: string; valueJson: unknown; previous: unknown | null }> {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new Error("System setting key is required.");
    }
    const existing = await this.getSystemSetting(normalizedKey);
    const { data, error } = await this.supabase
      .from("system_settings")
      .upsert(
        { key: normalizedKey, value_json: valueJson, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      )
      .select("key, value_json")
      .single<{ key: string; value_json: unknown }>();
    if (error || !data) {
      throw new Error(`Failed to upsert system setting: ${error?.message ?? "Unknown error"}`);
    }
    return { key: data.key, valueJson: data.value_json, previous: existing?.valueJson ?? null };
  }

  async listEmailTemplates(
    key?: string | null,
  ): Promise<Array<{ key: string; subject: string; textBody: string; htmlBody: string; updatedAt: string }>> {
    let query = this.supabase
      .from("email_templates")
      .select("key, subject, text_body, html_body, updated_at")
      .order("key", { ascending: true });
    const normalizedKey = key?.trim();
    if (normalizedKey) {
      query = query.eq("key", normalizedKey);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list email templates: ${error.message}`);
    }
    return ((data ?? []) as Array<{
      key: string;
      subject: string | null;
      text_body: string | null;
      html_body: string | null;
      updated_at: string;
    }>).map((row) => ({
      key: row.key,
      subject: row.subject ?? "",
      textBody: row.text_body ?? "",
      htmlBody: row.html_body ?? "",
      updatedAt: row.updated_at,
    }));
  }

  async upsertEmailTemplate(
    key: string,
    patch: { subject?: string; textBody?: string; htmlBody?: string },
  ): Promise<{
    key: string;
    subject: string;
    textBody: string;
    htmlBody: string;
    previous: { subject: string; textBody: string; htmlBody: string } | null;
  }> {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new Error("Email template key is required.");
    }
    const existingRows = await this.listEmailTemplates(normalizedKey);
    const existing = existingRows[0] ?? null;
    const nextRow = {
      key: normalizedKey,
      subject: patch.subject ?? existing?.subject ?? "",
      text_body: patch.textBody ?? existing?.textBody ?? "",
      html_body: patch.htmlBody ?? existing?.htmlBody ?? "",
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await this.supabase
      .from("email_templates")
      .upsert(nextRow, { onConflict: "key" })
      .select("key, subject, text_body, html_body")
      .single<{ key: string; subject: string | null; text_body: string | null; html_body: string | null }>();
    if (error || !data) {
      throw new Error(`Failed to upsert email template: ${error?.message ?? "Unknown error"}`);
    }
    return {
      key: data.key,
      subject: data.subject ?? "",
      textBody: data.text_body ?? "",
      htmlBody: data.html_body ?? "",
      previous: existing
        ? { subject: existing.subject, textBody: existing.textBody, htmlBody: existing.htmlBody }
        : null,
    };
  }

  async listInstructions(
    key?: string | null,
  ): Promise<Array<{ key: string; content: string; updatedAt: string }>> {
    let query = this.supabase
      .from("instructions")
      .select("key, content, updated_at")
      .order("key", { ascending: true });
    const normalizedKey = key?.trim();
    if (normalizedKey) {
      query = query.eq("key", normalizedKey);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list instructions: ${error.message}`);
    }
    return ((data ?? []) as Array<{ key: string; content: string | null; updated_at: string }>).map((row) => ({
      key: row.key,
      content: row.content ?? "",
      updatedAt: row.updated_at,
    }));
  }

  async upsertInstruction(
    key: string,
    content: string,
  ): Promise<{ key: string; content: string; previous: string | null }> {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new Error("Instruction key is required.");
    }
    const normalizedContent = content.trim();
    const existingRows = await this.listInstructions(normalizedKey);
    const existing = existingRows[0] ?? null;
    const { data, error } = await this.supabase
      .from("instructions")
      .upsert(
        { key: normalizedKey, content: normalizedContent, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      )
      .select("key, content")
      .single<{ key: string; content: string | null }>();
    if (error || !data) {
      throw new Error(`Failed to upsert instruction: ${error?.message ?? "Unknown error"}`);
    }
    return {
      key: data.key,
      content: data.content ?? "",
      previous: existing?.content ?? null,
    };
  }

  async recordAdminAuditLog(input: {
    adminActionId?: string | null;
    actorEmail: string;
    actionKind: string;
    entityType: string;
    entityRef: string;
    beforeJson?: unknown;
    afterJson?: unknown;
  }): Promise<void> {
    const normalizedActor = normalizeEmail(input.actorEmail);
    if (!isEmail(normalizedActor)) {
      throw new Error("A valid actor email is required for the admin audit log.");
    }
    const { error } = await this.supabase.from("admin_audit_log").insert({
      admin_action_id: input.adminActionId ?? null,
      actor_email: normalizedActor,
      action_kind: input.actionKind,
      entity_type: input.entityType,
      entity_ref: input.entityRef,
      before_json: input.beforeJson ?? null,
      after_json: input.afterJson ?? null,
    });
    if (error) {
      throw new Error(`Failed to record admin audit log: ${error.message}`);
    }
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
