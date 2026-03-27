export type Tier = "freemium" | "solopreneur" | "agency";

export type ActorRole = "user" | "rpm" | "master";

export interface RPMSuggestion {
  id: string;
  userId: string;
  projectId: string | null;
  fromEmail: string;
  content: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface TransactionEvent {
  hoursPurchased: number;
  hourlyRate: number;
  allocatedHours: number;
  bufferHours: number;
  saas2Fee: number;
  projectRemainder: number;
}

export interface UserProfileContext {
  communicationStyle: string;
  preferences: Record<string, unknown>;
  constraints: Record<string, unknown>;
  onboardingData: string;
  salesCallTranscripts: string[];
  longTermInstructions: string;
  behaviorModifiers: Record<string, unknown>;
}

export interface ProjectContext {
  projectId: string;
  userId: string;
  summary: string;
  /** Short line for “where we are now” (from Status: in email or stored state). */
  currentStatus: string;
  goals: string[];
  actionItems: string[];
  decisions: string[];
  risks: string[];
  recommendations: string[];
  notes: string[];
  remainderBalance: number;
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
  to: string[];
  cc: string[];
  subject: string;
  rawBody: string;
  parsed: {
    summary: string | null;
    currentStatus: string | null;
    goals: string[];
    actionItems: string[];
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
