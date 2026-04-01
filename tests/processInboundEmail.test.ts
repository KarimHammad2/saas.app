import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";

const emptyUserProfile = {
  communicationStyle: "",
  preferences: {},
  constraints: {},
  onboardingData: "",
  salesCallTranscripts: [] as string[],
  longTermInstructions: "",
  behaviorModifiers: {},
  structuredContext: {},
};

const defaultMockProject = {
  id: "p1",
  user_id: "u1",
  name: "Primary Project",
  project_code: "pjt-a1b2c3d4",
  remainder_balance: 0,
  reminder_balance: 3,
  usage_count: 0,
  kickoff_completed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

const repoState = {
  registerInboundEvent: vi.fn(),
  getOrCreateUserByEmail: vi.fn(),
  findProjectByCodeAndUser: vi.fn(),
  findProjectByThreadMessageIdForUser: vi.fn(),
  createProjectForUser: vi.fn(),
  storeRawProjectUpdate: vi.fn(),
  getActiveRpm: vi.fn(),
  storeSummary: vi.fn(),
  updateSummaryDisplay: vi.fn(),
  updateGoals: vi.fn(),
  appendActionItems: vi.fn(),
  updateDecisions: vi.fn(),
  updateRisks: vi.fn(),
  updateRecommendations: vi.fn(),
  updateNotes: vi.fn(),
  updateCurrentStatus: vi.fn(),
  storeUserProfileContext: vi.fn(),
  getUserProfile: vi.fn(),
  replaceStructuredUserProfileContext: vi.fn(),
  mergeStructuredUserProfileContext: vi.fn(),
  updateUserDisplayNameIfEmpty: vi.fn(),
  storeRPMSuggestion: vi.fn(),
  deletePendingSystemSuggestionsForProject: vi.fn(),
  incrementProjectUsageCount: vi.fn(),
  setKickoffCompleted: vi.fn(),
  approveSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
  addAdditionalEmails: vi.fn(),
  setUserTier: vi.fn(),
  assignRpm: vi.fn(),
  storeTransactionEvent: vi.fn(),
  snapshotProjectContext: vi.fn(),
  getProjectState: vi.fn(),
  getPendingSuggestions: vi.fn(),
};

vi.mock("@/modules/memory/repository", () => {
  return {
    MemoryRepository: class {
      registerInboundEvent = repoState.registerInboundEvent;
      getOrCreateUserByEmail = repoState.getOrCreateUserByEmail;
      findProjectByCodeAndUser = repoState.findProjectByCodeAndUser;
      findProjectByThreadMessageIdForUser = repoState.findProjectByThreadMessageIdForUser;
      createProjectForUser = repoState.createProjectForUser;
      storeRawProjectUpdate = repoState.storeRawProjectUpdate;
      getActiveRpm = repoState.getActiveRpm;
      storeSummary = repoState.storeSummary;
      updateSummaryDisplay = repoState.updateSummaryDisplay;
      updateGoals = repoState.updateGoals;
      appendActionItems = repoState.appendActionItems;
      updateDecisions = repoState.updateDecisions;
      updateRisks = repoState.updateRisks;
      updateRecommendations = repoState.updateRecommendations;
      updateNotes = repoState.updateNotes;
      updateCurrentStatus = repoState.updateCurrentStatus;
      storeUserProfileContext = repoState.storeUserProfileContext;
      getUserProfile = repoState.getUserProfile;
      replaceStructuredUserProfileContext = repoState.replaceStructuredUserProfileContext;
      mergeStructuredUserProfileContext = repoState.mergeStructuredUserProfileContext;
      updateUserDisplayNameIfEmpty = repoState.updateUserDisplayNameIfEmpty;
      storeRPMSuggestion = repoState.storeRPMSuggestion;
      deletePendingSystemSuggestionsForProject = repoState.deletePendingSystemSuggestionsForProject;
      incrementProjectUsageCount = repoState.incrementProjectUsageCount;
      setKickoffCompleted = repoState.setKickoffCompleted;
      approveSuggestion = repoState.approveSuggestion;
      rejectSuggestion = repoState.rejectSuggestion;
      addAdditionalEmails = repoState.addAdditionalEmails;
      setUserTier = repoState.setUserTier;
      assignRpm = repoState.assignRpm;
      storeTransactionEvent = repoState.storeTransactionEvent;
      snapshotProjectContext = repoState.snapshotProjectContext;
      getProjectState = repoState.getProjectState;
      getPendingSuggestions = repoState.getPendingSuggestions;
    },
  };
});

describe("processInboundEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repoState.registerInboundEvent.mockResolvedValue(true);
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u1",
        email: "user@example.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findProjectByCodeAndUser.mockResolvedValue(null);
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(null);
    repoState.createProjectForUser.mockResolvedValue({
      project: { ...defaultMockProject },
      created: true,
    });
    repoState.getActiveRpm.mockResolvedValue("rpm@example.com");
    repoState.addAdditionalEmails.mockResolvedValue(1);
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      summary: "summary",
      initialSummary: "summary",
      currentStatus: "",
      goals: [],
      actionItems: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "freemium",
      transactionHistory: [],
    });
    repoState.getPendingSuggestions.mockResolvedValue([]);
    repoState.getUserProfile.mockResolvedValue(emptyUserProfile);
    repoState.mergeStructuredUserProfileContext.mockResolvedValue(undefined);
    repoState.storeRPMSuggestion.mockImplementation(async (userId, projectId, _from, content, source) => ({
      id: "s1",
      userId,
      projectId,
      fromEmail: "system@saas2.app",
      content,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      source: source ?? "inbound",
    }));
  });

  it("returns recipients and state payload", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");

    const event: NormalizedEmailEvent = {
      eventId: "e1",
      provider: "resend",
      providerEventId: "m1",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Update",
      inReplyTo: null,
      references: [],
      rawBody: "Summary: hello",
      parsed: {
        summary: "hello",
        currentStatus: null,
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    const result = await processInboundEmail(event);
    expect(result.recipients).toEqual(["user@example.com", "rpm@example.com"]);
    expect(result.context.projectId).toBe("p1");
    expect(repoState.updateSummaryDisplay).not.toHaveBeenCalled();
    expect(repoState.updateNotes).toHaveBeenCalledWith("p1", [], event.timestamp);
    expect(repoState.mergeStructuredUserProfileContext).toHaveBeenCalled();
    expect(repoState.getPendingSuggestions).toHaveBeenCalledWith("u1", "p1");
  });

  it("does not infer profile updates from unlabeled content", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_profile",
      provider: "resend",
      providerEventId: "m_profile",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Plain update",
      inReplyTo: null,
      references: [],
      rawBody: "I'm a solo founder building SaaS and I prefer short answers.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: ["I'm a solo founder building SaaS and I prefer short answers."],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);
    expect(repoState.storeUserProfileContext).not.toHaveBeenCalled();
    expect(repoState.replaceStructuredUserProfileContext).not.toHaveBeenCalled();
  });

  it("infers memory signals from plain inbound content", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_infer",
      provider: "resend",
      providerEventId: "m_infer",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Project idea",
      inReplyTo: null,
      references: [],
      rawBody: "I want to build a SaaS for restaurants and start with an MVP.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: ["I want to build a SaaS for restaurants and start with an MVP."],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);
    expect(repoState.mergeStructuredUserProfileContext).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        industry: "restaurants",
        project_type: "SaaS",
        project_stage: "building",
      }),
    );
  });

  it("marks duplicate events and skips mutating writes", async () => {
    repoState.registerInboundEvent.mockResolvedValue(false);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e1",
      provider: "resend",
      providerEventId: "m1",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Update",
      inReplyTo: null,
      references: [],
      rawBody: "Summary: hello",
      parsed: {
        summary: "hello",
        currentStatus: null,
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    const result = await processInboundEmail(event);
    expect(result.context.duplicate).toBe(true);
    expect(repoState.storeRawProjectUpdate).not.toHaveBeenCalled();
  });

  it("supports approve and reject suggestion commands", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e2",
      provider: "resend",
      providerEventId: "m2",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Approvals",
      inReplyTo: null,
      references: [],
      rawBody: "approve suggestion abc123 reject suggestion def456",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [
          { suggestionId: "abc123", decision: "approve" },
          { suggestionId: "def456", decision: "reject" },
        ],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);
    expect(repoState.approveSuggestion).toHaveBeenCalledWith("u1", "abc123", "user@example.com");
    expect(repoState.rejectSuggestion).toHaveBeenCalledWith("u1", "def456", "user@example.com");
  });

  it("marks first inbound as welcome and stores parsed notes", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u1",
        email: "user@example.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findProjectByCodeAndUser.mockResolvedValue(null);
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(null);
    repoState.createProjectForUser.mockResolvedValue({
      project: { ...defaultMockProject, kickoff_completed_at: null },
      created: true,
    });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      summary: "",
      initialSummary: "",
      currentStatus: "",
      goals: [],
      actionItems: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: ["RAW NOTES"],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "freemium",
      transactionHistory: [],
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_welcome",
      provider: "resend",
      providerEventId: "m_welcome",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "New Project",
      inReplyTo: null,
      references: [],
      rawBody: "This message has no labeled meaning; it should become notes.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: ["RAW NOTES"],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    const result = await processInboundEmail(event);
    expect(result.payload.isWelcome).toBe(true);
    expect(repoState.updateNotes).toHaveBeenCalledWith("p1", ["RAW NOTES"], event.timestamp);
    expect(result.payload.nextSteps.some((step) => /timeline/i.test(step))).toBe(true);
    expect(result.payload.nextSteps.some((step) => /first milestone/i.test(step))).toBe(true);
  });

  it("does not mark welcome when kickoff is already completed", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u1",
        email: "user@example.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: true,
    });
    repoState.findProjectByCodeAndUser.mockResolvedValue(null);
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(null);
    repoState.createProjectForUser.mockResolvedValue({
      project: { ...defaultMockProject },
      created: true,
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_not_welcome",
      provider: "resend",
      providerEventId: "m_not_welcome",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Existing project update",
      inReplyTo: null,
      references: [],
      rawBody: "Summary: hello",
      parsed: {
        summary: "hello",
        currentStatus: null,
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    const result = await processInboundEmail(event);
    expect(result.payload.isWelcome).toBe(false);
    expect(result.payload.emailKind).toBe("update");
  });
});
