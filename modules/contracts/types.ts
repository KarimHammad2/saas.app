export type Tier = "freemium" | "solopreneur" | "agency";
export type PlanPackage = "solo" | "agency";
export type ProjectStatus = "active" | "paused" | "completed";

/** Playbook for kickoff defaults and system RPM suggestions (see projectDomain.ts). */
export type ProjectDomain = "general" | "tech_product" | "marketing" | "sales" | "operations";

export type ActorRole = "user" | "rpm" | "master";

export type RPMSuggestionSource = "inbound" | "system";

export interface RPMSuggestion {
  id: string;
  userId: string;
  projectId: string | null;
  fromEmail: string;
  content: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  source: RPMSuggestionSource;
}

/** Currency for the rate line in a Transaction block; drives checkout link catalog (USD vs CAD). */
export type TransactionRateCurrency = "usd" | "cad";

export interface TransactionEvent {
  hoursPurchased: number;
  hourlyRate: number;
  /** When omitted, treated as USD (backward compatible). Set from the rate line (e.g. CAD, CA$, C$). */
  rateCurrency?: TransactionRateCurrency;
  allocatedHours: number;
  bufferHours: number;
  saas2Fee: number;
  projectRemainder: number;
}

/** Persisted payment line + resolved checkout tier for hour purchases. */
export interface TransactionPaymentMeta {
  paymentTotal: number;
  paymentCurrency: string;
  paymentLinkUrl: string;
  paymentLinkTierAmount: number;
}

/** SOW-aligned structured profile (stored in user_profiles.context jsonb under `sowSignals`). */
export interface UserProfileStructuredContext {
  role?: string;
  business?: string;
  preferencesList?: string[];
  business_type?: string;
  goals_style?: string;
  preferences?: Record<string, unknown>;
  tone?: string;
  industry?: string;
  project_type?: string;
  project_stage?: string;
}

/** Nested keys in user_profiles.context JSONB (global user memory, not project data). */
export interface CommunicationStyleContext {
  tone?: string;
  format?: string;
  verbosity?: string;
}

export type UserProfileJsonRecord = Record<string, unknown>;

export interface UserProfileContext {
  communicationStyle: CommunicationStyleContext;
  preferences: UserProfileJsonRecord;
  constraints: UserProfileJsonRecord;
  onboardingData: UserProfileJsonRecord;
  salesCallTranscripts: string[];
  /** Long-running instructions (from UserProfile: sections, etc.). */
  longTermInstructions: string[];
  behaviorModifiers: UserProfileJsonRecord;
  /** SOW / inferred signals; persisted as `sowSignals` in JSONB. */
  structuredContext: UserProfileStructuredContext;
}

/** Default profile when the user has not stored context yet, or before their first `UserProfile:` / inferred update. */
export function emptyUserProfileContext(): UserProfileContext {
  return {
    communicationStyle: {},
    preferences: {},
    constraints: {},
    onboardingData: {},
    salesCallTranscripts: [],
    longTermInstructions: [],
    behaviorModifiers: {},
    structuredContext: {},
  };
}

export interface ProjectContext {
  projectId: string;
  userId: string;
  /** When unset, consumers may infer from summary/goals (see inferProjectDomainFromText). */
  projectDomain?: ProjectDomain;
  /** Short code for subjects and routing, e.g. pjt-a1b2c3d4 (display as [PJT-A1B2C3D4]). */
  projectCode?: string;
  projectName?: string;
  projectStatus: ProjectStatus;
  ownerDisplayName?: string;
  ownerEmail?: string;
  /** Active human RPM from rpm_assignments; included when present for outbound routing and docs. */
  activeRpmEmail?: string;
  summary: string;
  /** First kickoff overview text; used for rule-based overview regeneration (Phase 2). */
  initialSummary: string;
  /** Short line for “where we are now” (from Status: in email or stored state). */
  currentStatus: string;
  goals: string[];
  actionItems: string[];
  /** Subset of action items marked complete (same strings as in actionItems when possible). */
  completedTasks: string[];
  decisions: string[];
  risks: string[];
  recommendations: string[];
  notes: string[];
  /** Emails on this project thread (from/to/cc), excluding the system inbox address. */
  participants: string[];
  /** Dated lines for ## Recent Updates in the LLM project file. */
  recentUpdatesLog: string[];
  remainderBalance: number;
  /** Mocked reminder credits (distinct from financial remainder_balance). */
  reminderBalance: number;
  usageCount: number;
  tier: Tier;
  /** Plan packaging used for Solo vs Agency workflow gates. */
  planPackage?: PlanPackage;
  /** Server-side feature gates resolved from tier/package. */
  featureFlags?: {
    collaborators: boolean;
    oversight: boolean;
  };
  transactionHistory: TransactionRecord[];
}

/** Payment lifecycle on `transactions.status` (hour purchases and similar). */
export type TransactionPaymentStatus = "pending_payment" | "paid" | "cancelled";

export interface TransactionRecord {
  id: string;
  type: "hourPurchase" | "allocation" | "remainderAdjustment";
  hoursPurchased: number;
  hourlyRate: number;
  allocatedHours: number;
  bufferHours: number;
  saas2Fee: number;
  projectRemainder: number;
  createdAt: string;
  paymentTotal: number;
  paymentCurrency: string;
  paymentLinkUrl: string | null;
  paymentLinkTierAmount: number | null;
  paidAt: string | null;
  paymentStatus: TransactionPaymentStatus;
}

/** Labeled project-memory headings detected in inbound body (for deterministic RPM apply rules). */
export interface ProjectSectionPresence {
  goals: boolean;
  tasks: boolean;
  actionItems: boolean;
  completed: boolean;
  decisions: boolean;
  risks: boolean;
  summary: boolean;
  recommendations: boolean;
  notes: boolean;
}

export const EMPTY_PROJECT_SECTION_PRESENCE: ProjectSectionPresence = {
  goals: false,
  tasks: false,
  actionItems: false,
  completed: false,
  decisions: false,
  risks: false,
  summary: false,
  recommendations: false,
  notes: false,
};

export interface NormalizedEmailEvent {
  eventId: string;
  provider: string;
  providerEventId: string;
  timestamp: string;
  from: string;
  /** Display name from `Name <email>` when present. */
  fromDisplayName: string | null;
  to: string[];
  cc: string[];
  subject: string;
  /** First parent Message-ID from reply threading (normalized by parser). */
  inReplyTo: string | null;
  /** Additional Message-IDs from References header (normalized). */
  references: string[];
  /** Attachment metadata extracted from provider payload (content is never stored). */
  attachments?: Array<{
    filename: string | null;
    contentType: string | null;
    isPdf: boolean;
  }>;
  rawBody: string;
  parsed: {
    summary: string | null;
    currentStatus: string | null;
    projectStatus?: ProjectStatus | null;
    goals: string[];
    actionItems: string[];
    completedTasks: string[];
    decisions: string[];
    risks: string[];
    recommendations: string[];
    notes: string[];
    userProfileContext: string | null;
    rpmSuggestion: {
      content: string;
      from: string;
      timestamp: string;
    } | null;
    transactionEvent: TransactionEvent | null;
    approvals: {
      /** When null, the inbound processor resolves the pending suggestion for this project (oldest first). */
      suggestionId: string | null;
      decision: "approve" | "reject";
    }[];
    additionalEmails: string[];
    projectName?: string | null;
    /** Free-text body under Correction: or RPM Correction: (applied when sender is the assigned RPM). */
    correction?: string | null;
    /** First valid email under Assign RPM: (agency RPM selection via email). */
    assignRpmEmail?: string | null;
    /** Which project-memory section headings appeared (including empty sections). */
    projectSectionPresence: ProjectSectionPresence;
    /** Inbound body is a standalone "Paid" acknowledgement after checkout (no Transaction block in same message). */
    paymentReceivedAck?: boolean;
  };
}
