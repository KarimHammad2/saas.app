export type Tier = "freemium" | "solopreneur" | "agency";
export type PlanPackage = "solo" | "agency";

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

export interface TransactionEvent {
  hoursPurchased: number;
  hourlyRate: number;
  allocatedHours: number;
  bufferHours: number;
  saas2Fee: number;
  projectRemainder: number;
}

/** SOW-aligned structured profile (stored in user_profiles.context jsonb). */
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

export interface UserProfileContext {
  communicationStyle: string;
  preferences: Record<string, unknown>;
  constraints: Record<string, unknown>;
  onboardingData: string;
  salesCallTranscripts: string[];
  longTermInstructions: string;
  behaviorModifiers: Record<string, unknown>;
  structuredContext: UserProfileStructuredContext;
}

export interface ProjectContext {
  projectId: string;
  userId: string;
  /** Short code for subjects and routing, e.g. pjt-a1b2c3d4 (display as [PJT-A1B2C3D4]). */
  projectCode?: string;
  projectName?: string;
  ownerDisplayName?: string;
  ownerEmail?: string;
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
}

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
  rawBody: string;
  parsed: {
    summary: string | null;
    currentStatus: string | null;
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
      suggestionId: string;
      decision: "approve" | "reject";
    }[];
    additionalEmails: string[];
  };
}
