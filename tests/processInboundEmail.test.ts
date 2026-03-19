import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";

const repoState = {
  registerInboundEvent: vi.fn(),
  getOrCreateUserByEmail: vi.fn(),
  getOrCreateProject: vi.fn(),
  storeRawProjectUpdate: vi.fn(),
  getActiveRpm: vi.fn(),
  storeSummary: vi.fn(),
  updateGoals: vi.fn(),
  appendActionItems: vi.fn(),
  updateDecisions: vi.fn(),
  updateRisks: vi.fn(),
  updateRecommendations: vi.fn(),
  storeUserProfileContext: vi.fn(),
  storeRPMSuggestion: vi.fn(),
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
      getOrCreateProject = repoState.getOrCreateProject;
      storeRawProjectUpdate = repoState.storeRawProjectUpdate;
      getActiveRpm = repoState.getActiveRpm;
      storeSummary = repoState.storeSummary;
      updateGoals = repoState.updateGoals;
      appendActionItems = repoState.appendActionItems;
      updateDecisions = repoState.updateDecisions;
      updateRisks = repoState.updateRisks;
      updateRecommendations = repoState.updateRecommendations;
      storeUserProfileContext = repoState.storeUserProfileContext;
      storeRPMSuggestion = repoState.storeRPMSuggestion;
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
      user: { id: "u1", email: "user@example.com", tier: "freemium", created_at: new Date().toISOString() },
      created: false,
    });
    repoState.getOrCreateProject.mockResolvedValue({
      project: { id: "p1", user_id: "u1", name: "Primary Project", remainder_balance: 0, created_at: new Date().toISOString() },
      created: false,
    });
    repoState.getActiveRpm.mockResolvedValue("rpm@example.com");
    repoState.addAdditionalEmails.mockResolvedValue(1);
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      summary: "summary",
      goals: [],
      actionItems: [],
      decisions: [],
      risks: [],
      recommendations: [],
      remainderBalance: 0,
      transactionHistory: [],
    });
    repoState.getPendingSuggestions.mockResolvedValue([]);
  });

  it("returns recipients and state payload", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");

    const event: NormalizedEmailEvent = {
      eventId: "e1",
      provider: "resend",
      providerEventId: "m1",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      to: [],
      cc: [],
      subject: "Update",
      rawBody: "Summary: hello",
      parsed: {
        summary: "hello",
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
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
    expect(repoState.storeSummary).toHaveBeenCalledWith("p1", "hello");
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
      to: [],
      cc: [],
      subject: "Update",
      rawBody: "Summary: hello",
      parsed: {
        summary: "hello",
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
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
      to: [],
      cc: [],
      subject: "Approvals",
      rawBody: "approve suggestion abc123 reject suggestion def456",
      parsed: {
        summary: null,
        goals: [],
        actionItems: [],
        decisions: [],
        risks: [],
        recommendations: [],
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
});
