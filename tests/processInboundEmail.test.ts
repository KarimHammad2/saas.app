import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { NonRetryableInboundError } from "@/modules/orchestration/errors";

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
  owner_email: "user@example.com",
  name: "Primary Project",
  status: "active",
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
  findProjectByCode: vi.fn(),
  findProjectByThreadMessageIdForUser: vi.fn(),
  findProjectByThreadMessageId: vi.fn(),
  findProjectsWhereEmailInParticipantList: vi.fn(),
  findProjectsOwnedByUser: vi.fn(),
  mergeProjectParticipants: vi.fn(),
  getUserEmailById: vi.fn(),
  appendRecentUpdate: vi.fn(),
  createProjectForUser: vi.fn(),
  storeRawProjectUpdate: vi.fn(),
  getActiveRpm: vi.fn(),
  storeSummary: vi.fn(),
  updateSummaryDisplay: vi.fn(),
  updateGoals: vi.fn(),
  appendActionItems: vi.fn(),
  replaceActionItem: vi.fn(),
  markTasksCompleted: vi.fn(),
  updateDecisions: vi.fn(),
  updateRisks: vi.fn(),
  updateRecommendations: vi.fn(),
  updateNotes: vi.fn(),
  updateCurrentStatus: vi.fn(),
  updateProjectStatus: vi.fn(),
  updateProjectName: vi.fn(),
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
  storeProtectedTransactionSuggestion: vi.fn(),
  snapshotProjectContext: vi.fn(),
  getProjectState: vi.fn(),
  getPendingSuggestions: vi.fn(),
};

// Intent classification is tested separately in classifyInboundIntent.test.ts.
// Always allow project creation here so pipeline behaviour tests remain focused.
const classifyInboundIntentMock = vi.fn(() => ({ isNewProjectIntent: true, isGreetingOnly: false, confidence: 0.9, reason: "mock" }));
vi.mock("@/modules/orchestration/classifyInboundIntent", () => ({
  classifyInboundIntent: classifyInboundIntentMock,
}));

vi.mock("@/modules/memory/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/memory/repository")>("@/modules/memory/repository");
  return {
    ...actual,
    MemoryRepository: class {
      registerInboundEvent = repoState.registerInboundEvent;
      getOrCreateUserByEmail = repoState.getOrCreateUserByEmail;
      findProjectByCodeAndUser = repoState.findProjectByCodeAndUser;
      findProjectByCode = repoState.findProjectByCode;
      findProjectByThreadMessageIdForUser = repoState.findProjectByThreadMessageIdForUser;
      findProjectByThreadMessageId = repoState.findProjectByThreadMessageId;
      findProjectsWhereEmailInParticipantList = repoState.findProjectsWhereEmailInParticipantList;
      findProjectsOwnedByUser = repoState.findProjectsOwnedByUser;
      mergeProjectParticipants = repoState.mergeProjectParticipants;
      getUserEmailById = repoState.getUserEmailById;
      appendRecentUpdate = repoState.appendRecentUpdate;
      createProjectForUser = repoState.createProjectForUser;
      storeRawProjectUpdate = repoState.storeRawProjectUpdate;
      getActiveRpm = repoState.getActiveRpm;
      storeSummary = repoState.storeSummary;
      updateSummaryDisplay = repoState.updateSummaryDisplay;
      updateGoals = repoState.updateGoals;
      appendActionItems = repoState.appendActionItems;
      replaceActionItem = repoState.replaceActionItem;
      markTasksCompleted = repoState.markTasksCompleted;
      updateDecisions = repoState.updateDecisions;
      updateRisks = repoState.updateRisks;
      updateRecommendations = repoState.updateRecommendations;
      updateNotes = repoState.updateNotes;
      updateCurrentStatus = repoState.updateCurrentStatus;
      updateProjectStatus = repoState.updateProjectStatus;
      updateProjectName = repoState.updateProjectName;
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
      storeProtectedTransactionSuggestion = repoState.storeProtectedTransactionSuggestion;
      snapshotProjectContext = repoState.snapshotProjectContext;
      getProjectState = repoState.getProjectState;
      getPendingSuggestions = repoState.getPendingSuggestions;
    },
  };
});

describe("processInboundEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    classifyInboundIntentMock.mockReturnValue({
      isNewProjectIntent: true,
      isGreetingOnly: false,
      confidence: 0.9,
      reason: "mock",
    });
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
    repoState.findProjectByCode.mockResolvedValue(null);
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(null);
    repoState.findProjectByThreadMessageId.mockResolvedValue(null);
    repoState.findProjectsWhereEmailInParticipantList.mockResolvedValue([]);
    repoState.findProjectsOwnedByUser.mockResolvedValue([]);
    repoState.mergeProjectParticipants.mockResolvedValue(undefined);
    repoState.getUserEmailById.mockResolvedValue("user@example.com");
    repoState.appendRecentUpdate.mockResolvedValue(undefined);
    repoState.updateProjectName.mockResolvedValue(undefined);
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
      projectStatus: "active",
      ownerEmail: "user@example.com",
      summary: "summary",
      initialSummary: "summary",
      currentStatus: "",
      goals: [],
      actionItems: [],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      participants: [],
      recentUpdatesLog: [],
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
    repoState.storeProtectedTransactionSuggestion.mockImplementation(async (userId, projectId, fromEmail, event) => ({
      id: "txn-proposal-1",
      userId,
      projectId,
      fromEmail,
      content: JSON.stringify(event),
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      source: "inbound" as const,
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
        completedTasks: [],
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

  it("persists canonical project lifecycle status updates", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");

    const event: NormalizedEmailEvent = {
      eventId: "e_status",
      provider: "resend",
      providerEventId: "m_status",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Update",
      inReplyTo: null,
      references: [],
      rawBody: "Status:\n- paused",
      parsed: {
        summary: null,
        currentStatus: null,
        projectStatus: "paused",
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await processInboundEmail(event);

    expect(repoState.updateProjectStatus).toHaveBeenCalledWith("p1", "paused");
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p1", "Project status updated: Paused");
  });

  it('creates a new project from "I want to build X" style kickoff email', async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_create",
      provider: "resend",
      providerEventId: "m_create",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "I want to build a restaurant analytics SaaS",
      inReplyTo: null,
      references: [],
      rawBody: "I want to build a restaurant analytics SaaS with weekly KPI reports.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: ["I want to build a restaurant analytics SaaS with weekly KPI reports."],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    const result = await processInboundEmail(event);
    expect(repoState.createProjectForUser).toHaveBeenCalledWith("u1", "Restaurant Analytics Saas Weekly KPI");
    expect(result.context.projectId).toBe("p1");
    expect(result.payload.emailKind).toBeDefined();
  });

  it('creates a new project from "I\'m working on X" style kickoff email', async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_create_working_on",
      provider: "resend",
      providerEventId: "m_create_working_on",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "I'm working on a salon CRM",
      inReplyTo: null,
      references: [],
      rawBody: "I'm working on a salon CRM with booking reminders and client notes.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: ["I'm working on a salon CRM with booking reminders and client notes."],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    const result = await processInboundEmail(event);
    expect(repoState.createProjectForUser).toHaveBeenCalledWith("u1", "Salon CRM Booking Reminders Client");
    expect(result.context.projectId).toBe("p1");
    expect(result.payload.emailKind).toBeDefined();
  });

  it("uses multiline working-on phrase to derive a better kickoff name and overview", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    repoState.createProjectForUser.mockResolvedValueOnce({
      project: { ...defaultMockProject, kickoff_completed_at: null },
      created: true,
    });
    const rawBody = [
      "Hi Frank,",
      "",
      "I want to start a project.",
      "",
      "Here’s what we’re working on:",
      "platform for managing client projects across our team",
    ].join("\n");

    const event: NormalizedEmailEvent = {
      eventId: "e_create_multiline_working_on",
      provider: "resend",
      providerEventId: "m_create_multiline_working_on",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "New project kickoff",
      inReplyTo: null,
      references: [],
      rawBody,
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [rawBody],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);
    expect(repoState.createProjectForUser).toHaveBeenCalledWith("u1", "Platform Managing Client Projects Across");
    expect(repoState.storeSummary).toHaveBeenCalledWith(
      "p1",
      expect.stringContaining("Project focus: platform for managing client projects across our team."),
    );
  });

  it("resolves reply updates to the same project via In-Reply-To thread mapping", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject, id: "p-thread" });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p-thread",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      ownerEmail: "user@example.com",
      summary: "summary",
      initialSummary: "summary",
      currentStatus: "",
      goals: [],
      actionItems: [],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "freemium",
      transactionHistory: [],
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_reply",
      provider: "resend",
      providerEventId: "m_reply",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Project Update [PJT-A1B2C3D4]",
      inReplyTo: "<outbound-test-msg-id@saas2.app>",
      references: ["<outbound-test-msg-id@saas2.app>"],
      rawBody: "Tasks:\n- finalize dashboard filters",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: ["finalize dashboard filters"],
        completedTasks: [],
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
    expect(result.context.projectId).toBe("p-thread");
    expect(repoState.createProjectForUser).not.toHaveBeenCalled();
  });

  it("updates project name when inbound parsed Project Name differs", async () => {
    repoState.findProjectByCodeAndUser.mockResolvedValue({ ...defaultMockProject, name: "Old Name" });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_rename",
      provider: "resend",
      providerEventId: "m_rename",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Project Update — Old Name [PJT-A1B2C3D4]",
      inReplyTo: null,
      references: [],
      rawBody: "Project Name:\n- SMS SaaS Platform",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
        projectName: "SMS SaaS Platform",
      },
    };

    await processInboundEmail(event);
    expect(repoState.updateProjectName).toHaveBeenCalledWith("p1", "SMS SaaS Platform");
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p1", "Project renamed to: SMS SaaS Platform");
  });

  it("does not update project name when inbound name matches current", async () => {
    repoState.findProjectByCodeAndUser.mockResolvedValue({ ...defaultMockProject, name: "SMS SaaS Platform" });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_same_name",
      provider: "resend",
      providerEventId: "m_same_name",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Project Update — SMS SaaS Platform [PJT-A1B2C3D4]",
      inReplyTo: null,
      references: [],
      rawBody: "Rename project to: SMS SaaS Platform",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
        projectName: "SMS SaaS Platform",
      },
    };

    await processInboundEmail(event);
    expect(repoState.updateProjectName).not.toHaveBeenCalled();
  });

  it("rejects unknown external sender before participant merge (anti-hijack)", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u-outsider",
        email: "outsider@example.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(null);
    repoState.findProjectByThreadMessageId.mockResolvedValue({
      ...defaultMockProject,
      id: "p-protected",
      user_id: "u-owner",
    });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p-protected",
      userId: "u-owner",
      projectCode: "pjt-a1b2c3d4",
      ownerEmail: "owner@example.com",
      summary: "summary",
      initialSummary: "summary",
      currentStatus: "",
      goals: [],
      actionItems: [],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "freemium",
      transactionHistory: [],
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_hijack",
      provider: "resend",
      providerEventId: "m_hijack",
      timestamp: new Date().toISOString(),
      from: "outsider@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Protected [PJT-A1B2C3D4]",
      inReplyTo: "<mapped-thread@saas2.app>",
      references: [],
      rawBody: "Tasks:\n- malicious update attempt",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: ["malicious update attempt"],
        completedTasks: [],
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

    await expect(processInboundEmail(event)).rejects.toBeInstanceOf(NonRetryableInboundError);
    expect(repoState.mergeProjectParticipants).not.toHaveBeenCalled();
  });

  it("blocks new collaborator additions on solo package projects", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_solo_participant_gate",
      provider: "resend",
      providerEventId: "m_solo_participant_gate",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: ["collab@example.com"],
      subject: "Update with CC",
      inReplyTo: null,
      references: [],
      rawBody: "Summary: update",
      parsed: {
        summary: "update",
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await processInboundEmail(event);
    expect(repoState.mergeProjectParticipants).toHaveBeenCalledWith("p1", ["user@example.com"]);
  });

  it("prefers reply thread mapping over conflicting subject project code", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject, id: "p-thread", project_code: "pjt-thread1" });
    repoState.findProjectByCodeAndUser.mockResolvedValue({ ...defaultMockProject, id: "p-code", project_code: "pjt-code99" });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p-thread",
      userId: "u1",
      projectCode: "pjt-thread1",
      ownerEmail: "user@example.com",
      summary: "summary",
      initialSummary: "summary",
      currentStatus: "",
      goals: [],
      actionItems: [],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "freemium",
      transactionHistory: [],
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_thread_wins",
      provider: "resend",
      providerEventId: "m_thread_wins",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Update [PJT-C0DE99]",
      inReplyTo: "<outbound-thread@saas2.app>",
      references: [],
      rawBody: "Tasks:\n- finalize analytics export",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: ["finalize analytics export"],
        completedTasks: [],
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
    expect(result.context.projectId).toBe("p-thread");
    expect(repoState.findProjectByCodeAndUser).not.toHaveBeenCalled();
  });

  it("records recent updates when goals, tasks, decisions, risks, and notes are provided", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_recent",
      provider: "resend",
      providerEventId: "m_recent",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Structured update",
      inReplyTo: null,
      references: [],
      rawBody: "Goals:\n- Reach 100 beta users\nTasks:\n- Ship onboarding\nDecisions:\n- Weekly releases\nRisks:\n- QA bandwidth\nNotes:\n- Need clearer QA ownership",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: ["Reach 100 beta users"],
        actionItems: ["Ship onboarding"],
        completedTasks: [],
        decisions: ["Weekly releases"],
        risks: ["QA bandwidth"],
        recommendations: [],
        notes: ["Need clearer QA ownership"],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);
    const recentLines = repoState.appendRecentUpdate.mock.calls.map((call) => String(call[1]));
    expect(recentLines.some((line) => line.includes("Goals updated:"))).toBe(true);
    expect(recentLines.some((line) => line.includes("Task(s) added:"))).toBe(true);
    expect(recentLines.some((line) => line.includes("Decision(s) added:"))).toBe(true);
    expect(recentLines.some((line) => line.includes("Risk(s) added:"))).toBe(true);
    expect(recentLines.some((line) => line.includes("Notes updated"))).toBe(true);
  });

  it("routes unmatched completion-like text to notes when no confident task match is found", async () => {
    const stateWithAuthTask = {
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      ownerEmail: "user@example.com",
      summary: "summary",
      initialSummary: "summary",
      currentStatus: "",
      goals: [],
      actionItems: ["Build authentication system"],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "freemium" as const,
      transactionHistory: [],
    };
    repoState.getProjectState
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_unmatched_done",
      provider: "resend",
      providerEventId: "m_unmatched_done",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Progress update",
      inReplyTo: null,
      references: [],
      rawBody: "Auth is done",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await processInboundEmail(event);
    expect(repoState.markTasksCompleted).toHaveBeenCalledWith("p1", []);
    expect(repoState.updateNotes).toHaveBeenCalledWith("p1", ["Auth is done"], event.timestamp);
  });

  it("marks completion when free text confidently matches an in-progress task", async () => {
    const stateWithAuthTask = {
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      ownerEmail: "user@example.com",
      summary: "summary",
      initialSummary: "summary",
      currentStatus: "",
      goals: [],
      actionItems: ["Build authentication system"],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "freemium" as const,
      transactionHistory: [],
    };
    repoState.getProjectState
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask)
      .mockResolvedValueOnce(stateWithAuthTask);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_matched_done",
      provider: "resend",
      providerEventId: "m_matched_done",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Progress update",
      inReplyTo: null,
      references: [],
      rawBody: "Build authentication system is done",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await processInboundEmail(event);
    expect(repoState.markTasksCompleted).toHaveBeenCalledWith("p1", ["Build authentication system"]);
    expect(repoState.updateNotes).toHaveBeenCalledWith("p1", [], event.timestamp);
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
        completedTasks: [],
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
        completedTasks: [],
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
        completedTasks: [],
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
        completedTasks: [],
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

  it("does not allow RPM role to approve/reject suggestions by email", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_approval_attempt",
      provider: "resend",
      providerEventId: "m_rpm_approval_attempt",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
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
        completedTasks: [],
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
    expect(repoState.approveSuggestion).not.toHaveBeenCalled();
    expect(repoState.rejectSuggestion).not.toHaveBeenCalled();
  });

  it("stores inbound RPM suggestion as pending without mutating confirmed project sections directly", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_inbound",
      provider: "resend",
      providerEventId: "m_rpm_inbound",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Suggestion",
      inReplyTo: null,
      references: [],
      rawBody: "UserProfile Suggestion:\nCapture one explicit decision under Decisions.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        userProfileContext: null,
        rpmSuggestion: {
          content: "Capture one explicit decision under Decisions.",
          from: "rpm@example.com",
          timestamp: new Date().toISOString(),
        },
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);
    expect(repoState.storeRPMSuggestion).toHaveBeenCalledWith(
      "u1",
      "p1",
      "rpm@example.com",
      "Capture one explicit decision under Decisions.",
    );
    expect(repoState.updateDecisions).toHaveBeenCalledWith("p1", []);
  });

  it("generates system suggestions as pending records (not confirmed state mutations)", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_system",
      provider: "resend",
      providerEventId: "m_rpm_system",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Update",
      inReplyTo: null,
      references: [],
      rawBody: "Summary: short update",
      parsed: {
        summary: "short update",
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await processInboundEmail(event);
    const systemSuggestionCalls = repoState.storeRPMSuggestion.mock.calls.filter((call) => call[4] === "system");
    expect(systemSuggestionCalls.length).toBeGreaterThan(0);
    expect(repoState.deletePendingSystemSuggestionsForProject).toHaveBeenCalledWith("p1");
  });

  it("stores transaction as protected pending proposal for RPM role instead of committing immediately", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_protected_txn",
      provider: "resend",
      providerEventId: "m_protected_txn",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Transaction proposal",
      inReplyTo: null,
      references: [],
      rawBody: "Transaction:\nHours Purchased: 10\nHourly Rate: 50",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: {
          hoursPurchased: 10,
          hourlyRate: 50,
          allocatedHours: 9,
          bufferHours: 1,
          saas2Fee: 50,
          projectRemainder: 0,
        },
        approvals: [],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);
    expect(repoState.storeProtectedTransactionSuggestion).toHaveBeenCalledWith(
      "u1",
      "p1",
      "rpm@example.com",
      expect.objectContaining({
        hoursPurchased: 10,
        hourlyRate: 50,
      }),
    );
    expect(repoState.storeTransactionEvent).not.toHaveBeenCalled();
  });

  it("commits transaction immediately for user role", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_user_txn",
      provider: "resend",
      providerEventId: "m_user_txn",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Transaction commit",
      inReplyTo: null,
      references: [],
      rawBody: "Transaction:\nHours Purchased: 5\nHourly Rate: 100",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: {
          hoursPurchased: 5,
          hourlyRate: 100,
          allocatedHours: 4.5,
          bufferHours: 0.5,
          saas2Fee: 50,
          projectRemainder: 0,
        },
        approvals: [],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);
    expect(repoState.storeTransactionEvent).toHaveBeenCalledWith(
      "p1",
      "user@example.com",
      expect.objectContaining({
        hoursPurchased: 5,
        hourlyRate: 100,
      }),
    );
    expect(repoState.storeProtectedTransactionSuggestion).not.toHaveBeenCalled();
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
      ownerEmail: "user@example.com",
      summary: "",
      initialSummary: "",
      currentStatus: "",
      goals: [],
      actionItems: [],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: ["RAW NOTES"],
      participants: [],
      recentUpdatesLog: [],
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
        completedTasks: [],
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
        completedTasks: [],
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

  it("requires clarification for greeting-only new non-thread inbound", async () => {
    classifyInboundIntentMock.mockReturnValue({
      isNewProjectIntent: false,
      isGreetingOnly: true,
      confidence: 0.1,
      reason: "matches known vague/greeting pattern",
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_greeting",
      provider: "resend",
      providerEventId: "m_greeting",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Hello",
      inReplyTo: null,
      references: [],
      rawBody: "hello",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await expect(processInboundEmail(event)).rejects.toMatchObject({ name: "ClarificationRequiredError" });
  });

  it("requires clarification for low-context non-thread email without explicit new-project intent", async () => {
    classifyInboundIntentMock.mockReturnValue({
      isNewProjectIntent: false,
      isGreetingOnly: false,
      confidence: 0.2,
      reason: "insufficient project-intent signals",
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_low_context",
      provider: "resend",
      providerEventId: "m_low_context",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "quick update",
      inReplyTo: null,
      references: [],
      rawBody: "done, thanks",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: ["done, thanks"],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    await expect(processInboundEmail(event)).rejects.toMatchObject({ name: "ClarificationRequiredError" });
    expect(repoState.createProjectForUser).not.toHaveBeenCalled();
  });

  it("requires clarification when subject has unknown project code", async () => {
    classifyInboundIntentMock.mockReturnValue({
      isNewProjectIntent: true,
      isGreetingOnly: false,
      confidence: 0.9,
      reason: "strong new project intent",
    });
    repoState.findProjectByCodeAndUser.mockResolvedValue(null);
    repoState.findProjectByCode.mockResolvedValue(null);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_unknown_code",
      provider: "resend",
      providerEventId: "m_unknown_code",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Update [PJT-ABCDEF12]",
      inReplyTo: null,
      references: [],
      rawBody: "I want to build a totally new thing.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: ["I want to build a totally new thing."],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    await expect(processInboundEmail(event)).rejects.toMatchObject({ name: "ClarificationRequiredError" });
    expect(repoState.createProjectForUser).not.toHaveBeenCalled();
  });

  it("requires clarification when thread context exists but no mapped project is found", async () => {
    classifyInboundIntentMock.mockReturnValue({
      isNewProjectIntent: true,
      isGreetingOnly: false,
      confidence: 0.9,
      reason: "strong new project intent",
    });
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(null);
    repoState.findProjectByThreadMessageId.mockResolvedValue(null);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_unresolved_thread",
      provider: "resend",
      providerEventId: "m_unresolved_thread",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<unknown-thread@saas2.app>",
      references: [],
      rawBody: "I want to build another product now.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: ["I want to build another product now."],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    await expect(processInboundEmail(event)).rejects.toMatchObject({ name: "ClarificationRequiredError" });
    expect(repoState.createProjectForUser).not.toHaveBeenCalled();
  });

  it("writes deterministic scope-change overview and notes without explicit summary", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_scope",
      provider: "resend",
      providerEventId: "m_scope",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Direction change",
      inReplyTo: null,
      references: [],
      rawBody: "We are no longer doing mobile app for habits, now it's a web dashboard",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await processInboundEmail(event);
    expect(repoState.updateSummaryDisplay).toHaveBeenCalledWith("p1", expect.stringContaining("web dashboard"));
    expect(
      repoState.updateNotes.mock.calls.some(
        (call) =>
          call[0] === "p1" &&
          call[2] === event.timestamp &&
          Array.isArray(call[1]) &&
          call[1].some(
            (line: unknown) =>
              typeof line === "string" &&
              line.includes("Scope changed from mobile app for habits") &&
              line.includes("web dashboard"),
          ),
      ),
    ).toBe(true);
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p1", "Scope changed");
  });

  it("applies minimal overview update on scope change even when parsed summary is present", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_scope_summary",
      provider: "resend",
      providerEventId: "m_scope_summary",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Direction update",
      inReplyTo: null,
      references: [],
      rawBody: "We are no longer doing mobile app for habits, now it's a web dashboard for agencies.",
      parsed: {
        summary: "Pivoted to a web dashboard for agencies.",
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await processInboundEmail(event);
    expect(repoState.updateSummaryDisplay).toHaveBeenCalledWith("p1", expect.stringContaining("web dashboard for agencies"));
  });

  it("keeps existing goals/tasks and does not create a new project on threaded scope pivot", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject, id: "p-thread" });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p-thread",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      ownerEmail: "user@example.com",
      summary: "mobile app for habit tracking",
      initialSummary: "mobile app for habit tracking",
      currentStatus: "",
      goals: ["launch MVP"],
      actionItems: ["build auth", "build tracker"],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "agency",
      transactionHistory: [],
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_scope_threaded",
      provider: "resend",
      providerEventId: "m_scope_threaded",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Direction change [PJT-A1B2C3D4]",
      inReplyTo: "<thread-msg@saas2.app>",
      references: ["<thread-msg@saas2.app>"],
      rawBody: "We are no longer building a mobile app. Instead we want a shared spreadsheet workflow for gyms.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await processInboundEmail(event);
    expect(repoState.createProjectForUser).not.toHaveBeenCalled();
    expect(repoState.updateGoals).toHaveBeenCalledWith("p-thread", []);
    expect(repoState.appendActionItems).toHaveBeenCalledWith("p-thread", []);
    expect(repoState.updateSummaryDisplay).toHaveBeenCalledWith("p-thread", expect.stringContaining("shared spreadsheet workflow for gyms"));
  });

  it("updates overview to the new direction for two-sentence pivot phrasing", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject, id: "p-two-sentence" });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p-two-sentence",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      ownerEmail: "user@example.com",
      summary: "mobile app for habit tracking",
      initialSummary: "mobile app for habit tracking",
      currentStatus: "",
      goals: ["launch MVP"],
      actionItems: ["build auth", "build tracker"],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "agency",
      transactionHistory: [],
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_scope_sentence_style",
      provider: "resend",
      providerEventId: "m_scope_sentence_style",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Pivot [PJT-A1B2C3D4]",
      inReplyTo: "<thread-two-sentence@saas2.app>",
      references: [],
      rawBody: "We are no longer building a mobile app. We want a shared spreadsheet workflow for gyms instead.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await processInboundEmail(event);
    expect(repoState.updateSummaryDisplay).toHaveBeenCalledWith("p-two-sentence", "a shared spreadsheet workflow for gyms");
    expect(repoState.updateNotes).toHaveBeenCalledWith(
      "p-two-sentence",
      [expect.stringContaining("Scope changed from a mobile app to a shared spreadsheet workflow for gyms")],
      event.timestamp,
    );
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p-two-sentence", "Scope changed");
  });

  it("allows cc participant to reply in same thread without creating a new project", async () => {
    const threadProject = { ...defaultMockProject, id: "p-collab", user_id: "u-owner", owner_email: "owner@example.com" };
    repoState.getProjectState
      .mockResolvedValueOnce({
        projectId: "p-collab",
        userId: "u-owner",
        projectCode: "pjt-a1b2c3d4",
        ownerEmail: "owner@example.com",
        summary: "summary",
        initialSummary: "summary",
        currentStatus: "",
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        participants: [],
        recentUpdatesLog: [],
        remainderBalance: 0,
        reminderBalance: 3,
        usageCount: 0,
        tier: "agency",
        transactionHistory: [],
      })
      .mockResolvedValue({
        projectId: "p-collab",
        userId: "u-owner",
        projectCode: "pjt-a1b2c3d4",
        ownerEmail: "owner@example.com",
        summary: "summary",
        initialSummary: "summary",
        currentStatus: "",
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        participants: ["collab@example.com"],
        recentUpdatesLog: [],
        remainderBalance: 0,
        reminderBalance: 3,
        usageCount: 0,
        tier: "agency",
        transactionHistory: [],
      });
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(null);
    repoState.findProjectByThreadMessageId.mockResolvedValue(threadProject);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const ownerEvent: NormalizedEmailEvent = {
      eventId: "e_owner_cc",
      provider: "resend",
      providerEventId: "m_owner_cc",
      timestamp: new Date().toISOString(),
      from: "owner@example.com",
      fromDisplayName: null,
      to: [],
      cc: ["collab@example.com"],
      subject: "Re: Update [PJT-A1B2C3D4]",
      inReplyTo: "<thread-collab@saas2.app>",
      references: [],
      rawBody: "Quick update",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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
    await processInboundEmail(ownerEvent);
    expect(repoState.mergeProjectParticipants).toHaveBeenCalledWith("p-collab", ["owner@example.com", "collab@example.com"]);

    repoState.getOrCreateUserByEmail.mockResolvedValueOnce({
      user: {
        id: "u-collab",
        email: "collab@example.com",
        display_name: null,
        tier: "agency",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    const collabEvent: NormalizedEmailEvent = {
      ...ownerEvent,
      eventId: "e_collab_reply",
      providerEventId: "m_collab_reply",
      from: "collab@example.com",
      cc: [],
      rawBody: "Tasks:\n- refine onboarding copy",
      parsed: {
        ...ownerEvent.parsed,
        actionItems: ["refine onboarding copy"],
      },
    };

    await processInboundEmail(collabEvent);
    expect(repoState.createProjectForUser).not.toHaveBeenCalled();
  });

  it("requires clarification when non-thread email mentions one existing project without explicit thread/code context", async () => {
    classifyInboundIntentMock.mockReturnValue({
      isNewProjectIntent: false,
      isGreetingOnly: false,
      confidence: 0.2,
      reason: "insufficient project-intent signals",
    });
    repoState.findProjectsOwnedByUser.mockResolvedValue([
      { ...defaultMockProject, id: "p1", name: "Alpha Dashboard" },
    ]);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_ambiguous_ctx",
      provider: "resend",
      providerEventId: "m_ambiguous_ctx",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Dashboard update",
      inReplyTo: null,
      references: [],
      rawBody: "Need to update Alpha Dashboard soon.",
      parsed: {
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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

    await expect(processInboundEmail(event)).rejects.toMatchObject({ name: "ClarificationRequiredError" });
    expect(repoState.createProjectForUser).not.toHaveBeenCalled();
  });
});
