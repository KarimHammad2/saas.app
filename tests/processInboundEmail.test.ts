import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEmailEvent, ProjectContext } from "@/modules/contracts/types";
import { EMPTY_PROJECT_SECTION_PRESENCE, emptyUserProfileContext } from "@/modules/contracts/types";
import { extractKickoffSeed } from "@/modules/domain/kickoffSeed";
import { generateShortProjectName } from "@/modules/domain/projectName";
import { parseNormalizedContent } from "@/modules/email/parseInbound";
import { CcMembershipConfirmationRequiredError, NonRetryableInboundError } from "@/modules/orchestration/errors";

/** Mirrors `deriveProjectName` in processInboundEmail for assertions on deferred CC kickoff resolution. */
function expectedDerivedProjectName(rawBody: string, subject: string): string {
  const parsed = parseNormalizedContent(rawBody);
  const trimmedBody = (rawBody ?? "").trim();
  const parsedSummary = (parsed.summary ?? "").trim();

  const bodyKickoff = trimmedBody
    ? extractKickoffSeed(trimmedBody)
    : { seed: null, sourcePhrase: null, sourceParagraph: null };
  if (bodyKickoff.seed) {
    return generateShortProjectName(bodyKickoff.seed, "New Project");
  }
  const fromBody = parsedSummary || bodyKickoff.sourceParagraph || trimmedBody;
  if (fromBody) {
    return generateShortProjectName(fromBody, "New Project");
  }

  const withoutToken = subject.replace(/\[PJT-[A-F0-9]{6,10}\]/gi, "").trim();
  const cleanedSubject = withoutToken.replace(/^re:\s*/i, "").trim();
  const subjectKickoffSeed = extractKickoffSeed(cleanedSubject).seed;
  if (subjectKickoffSeed) {
    return generateShortProjectName(subjectKickoffSeed, "New Project");
  }
  if (cleanedSubject) {
    return generateShortProjectName(cleanedSubject, "New Project");
  }

  return "New Project";
}

describe("deriveProjectName (large free-form kickoff bodies)", () => {
  it("names the project from the pitch paragraph, not the greeting or context paragraph", () => {
    const rawBody = [
      "Hi Frank,",
      "",
      "Hope you're doing well! It's been a while since we last spoke at the conference in Lisbon.",
      "I was referred to you by Sarah from Acme Corp, who said you were the person to talk to",
      "about getting new projects off the ground.",
      "",
      "Anyway, I'm building a customer portal for agencies to run multi-client workflows.",
      "",
      "Looking forward to hearing from you.",
      "",
      "Thanks,",
      "Alex",
    ].join("\n");

    const name = expectedDerivedProjectName(rawBody, "Re: quick intro");
    expect(name).toBe("Customer Portal Agencies Run");
    expect(name.toLowerCase()).not.toContain("hope");
    expect(name.toLowerCase()).not.toContain("referred");
    expect(name.toLowerCase()).not.toContain("frank");
  });

  it("drops verb particles and weak adjectives when the pitch is buried in a long body", () => {
    const rawBody = [
      "Hello Frank,",
      "",
      "Quick context: we've been operating a small shop in Austin for five years",
      "and our scheduling has always been a pain.",
      "",
      "We want to build out a new simple marketing campaign for local restaurants and cafes.",
      "",
      "Let me know what you think.",
      "",
      "Best,",
      "Dana",
    ].join("\n");

    const name = expectedDerivedProjectName(rawBody, "New project idea");
    expect(name).toBe("Marketing Campaign Local Restaurants");
  });
});

const emptyUserProfile = emptyUserProfileContext();

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
  last_contact_at: null,
  created_at: new Date().toISOString(),
};

function buildProjectState(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
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
    featureFlags: { collaborators: false, oversight: false },
    transactionHistory: [],
    activeRpmEmail: undefined,
    ...overrides,
  };
}

const repoState = {
  registerInboundEvent: vi.fn(),
  ensureUserProfileRow: vi.fn(),
  getOrCreateUserByEmail: vi.fn(),
  findUserByEmail: vi.fn(),
  listUsers: vi.fn(),
  findProjectByCodeAndUser: vi.fn(),
  findProjectByCode: vi.fn(),
  findProjectByThreadMessageIdForUser: vi.fn(),
  findProjectByThreadMessageId: vi.fn(),
  findProjectsWhereEmailInParticipantList: vi.fn(),
  findProjectsOwnedByUser: vi.fn(),
  mergeProjectParticipants: vi.fn(),
  getUserEmailById: vi.fn(),
  getUserEmailsById: vi.fn(),
  appendRecentUpdate: vi.fn(),
  createProjectForUser: vi.fn(),
  storeRawProjectUpdate: vi.fn(),
  storeFollowUps: vi.fn(),
  getActiveRpm: vi.fn(),
  storeSummary: vi.fn(),
  updateSummaryDisplay: vi.fn(),
  updateGoals: vi.fn(),
  replaceGoals: vi.fn(),
  appendActionItems: vi.fn(),
  replaceActionItems: vi.fn(),
  replaceActionItem: vi.fn(),
  markTasksCompleted: vi.fn(),
  updateDecisions: vi.fn(),
  updateRisks: vi.fn(),
  updateRecommendations: vi.fn(),
  updateNotes: vi.fn(),
  updateCurrentStatus: vi.fn(),
  updateProjectStatus: vi.fn(),
  updateProjectName: vi.fn(),
  updateProjectLastContactAt: vi.fn(),
  storeUserProfileContext: vi.fn(),
  getUserProfile: vi.fn(),
  replaceStructuredUserProfileContext: vi.fn(),
  mergeStructuredUserProfileContext: vi.fn(),
  patchUserProfileContextJson: vi.fn(),
  updateUserDisplayNameIfEmpty: vi.fn(),
  storeRPMSuggestion: vi.fn(),
  deletePendingSystemSuggestionsForProject: vi.fn(),
  incrementProjectUsageCount: vi.fn(),
  setKickoffCompleted: vi.fn(),
  setProjectDomain: vi.fn(),
  approveSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
  addAdditionalEmails: vi.fn(),
  addProjectMembersByEmails: vi.fn(),
  setUserTier: vi.fn(),
  createOrReusePendingCcMembershipConfirmation: vi.fn(),
  findLatestPendingCcMembershipConfirmation: vi.fn(),
  resolveCcMembershipConfirmation: vi.fn(),
  findLatestPendingApproval: vi.fn(),
  createOrReusePendingAdminAction: vi.fn(),
  findLatestPendingAdminAction: vi.fn(),
  resolvePendingAdminAction: vi.fn(),
  findProjectById: vi.fn(),
  assignRpm: vi.fn(),
  deactivateActiveRpm: vi.fn(),
  applyAgencyTierRpmTransition: vi.fn(),
  getAgencyDefaultRpmEmail: vi.fn(),
  storeTransactionEvent: vi.fn(),
  markLatestPendingHourPurchasePaid: vi.fn(),
  storeProtectedTransactionSuggestion: vi.fn(),
  snapshotProjectContext: vi.fn(),
  getProjectState: vi.fn(),
  getPendingSuggestions: vi.fn(),
  findProjectsByName: vi.fn(),
  setProjectArchived: vi.fn(),
  replaceProjectRisks: vi.fn(),
  replaceProjectNotes: vi.fn(),
  replaceProjectSummary: vi.fn(),
  replaceProjectCurrentStatus: vi.fn(),
  listProjectUpdates: vi.fn(),
  listOutboundDocumentEvents: vi.fn(),
  listSystemSettings: vi.fn(),
  getSystemSetting: vi.fn(),
  upsertSystemSetting: vi.fn(),
  listEmailTemplates: vi.fn(),
  upsertEmailTemplate: vi.fn(),
  listInstructions: vi.fn(),
  upsertInstruction: vi.fn(),
  recordAdminAuditLog: vi.fn(),
  loadProjectDeletionSnapshot: vi.fn(),
  hardDeleteProject: vi.fn(),
  loadUserDeletionSnapshot: vi.fn(),
  hardDeleteUser: vi.fn(),
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
      ensureUserProfileRow = repoState.ensureUserProfileRow;
      getOrCreateUserByEmail = repoState.getOrCreateUserByEmail;
      findUserByEmail = repoState.findUserByEmail;
      listUsers = repoState.listUsers;
      findProjectByCodeAndUser = repoState.findProjectByCodeAndUser;
      findProjectByCode = repoState.findProjectByCode;
      findProjectByThreadMessageIdForUser = repoState.findProjectByThreadMessageIdForUser;
      findProjectByThreadMessageId = repoState.findProjectByThreadMessageId;
      findProjectsWhereEmailInParticipantList = repoState.findProjectsWhereEmailInParticipantList;
      findProjectsOwnedByUser = repoState.findProjectsOwnedByUser;
      mergeProjectParticipants = repoState.mergeProjectParticipants;
      getUserEmailById = repoState.getUserEmailById;
      getUserEmailsById = repoState.getUserEmailsById;
      appendRecentUpdate = repoState.appendRecentUpdate;
      createProjectForUser = repoState.createProjectForUser;
      storeRawProjectUpdate = repoState.storeRawProjectUpdate;
      storeFollowUps = repoState.storeFollowUps;
      getActiveRpm = repoState.getActiveRpm;
      storeSummary = repoState.storeSummary;
      updateSummaryDisplay = repoState.updateSummaryDisplay;
      updateGoals = repoState.updateGoals;
      replaceGoals = repoState.replaceGoals;
      appendActionItems = repoState.appendActionItems;
      replaceActionItems = repoState.replaceActionItems;
      replaceActionItem = repoState.replaceActionItem;
      markTasksCompleted = repoState.markTasksCompleted;
      updateDecisions = repoState.updateDecisions;
      updateRisks = repoState.updateRisks;
      updateRecommendations = repoState.updateRecommendations;
      updateNotes = repoState.updateNotes;
      updateCurrentStatus = repoState.updateCurrentStatus;
      updateProjectStatus = repoState.updateProjectStatus;
      updateProjectName = repoState.updateProjectName;
      updateProjectLastContactAt = repoState.updateProjectLastContactAt;
      storeUserProfileContext = repoState.storeUserProfileContext;
      getUserProfile = repoState.getUserProfile;
      replaceStructuredUserProfileContext = repoState.replaceStructuredUserProfileContext;
      mergeStructuredUserProfileContext = repoState.mergeStructuredUserProfileContext;
      patchUserProfileContextJson = repoState.patchUserProfileContextJson;
      updateUserDisplayNameIfEmpty = repoState.updateUserDisplayNameIfEmpty;
      storeRPMSuggestion = repoState.storeRPMSuggestion;
      deletePendingSystemSuggestionsForProject = repoState.deletePendingSystemSuggestionsForProject;
      incrementProjectUsageCount = repoState.incrementProjectUsageCount;
      setKickoffCompleted = repoState.setKickoffCompleted;
      setProjectDomain = repoState.setProjectDomain;
      approveSuggestion = repoState.approveSuggestion;
      rejectSuggestion = repoState.rejectSuggestion;
      addAdditionalEmails = repoState.addAdditionalEmails;
      addProjectMembersByEmails = repoState.addProjectMembersByEmails;
      setUserTier = repoState.setUserTier;
      createOrReusePendingCcMembershipConfirmation = repoState.createOrReusePendingCcMembershipConfirmation;
      findLatestPendingCcMembershipConfirmation = repoState.findLatestPendingCcMembershipConfirmation;
      resolveCcMembershipConfirmation = repoState.resolveCcMembershipConfirmation;
      findLatestPendingApproval = repoState.findLatestPendingApproval;
      createOrReusePendingAdminAction = repoState.createOrReusePendingAdminAction;
      findLatestPendingAdminAction = repoState.findLatestPendingAdminAction;
      resolvePendingAdminAction = repoState.resolvePendingAdminAction;
      findProjectById = repoState.findProjectById;
      assignRpm = repoState.assignRpm;
      deactivateActiveRpm = repoState.deactivateActiveRpm;
      applyAgencyTierRpmTransition = repoState.applyAgencyTierRpmTransition;
      getAgencyDefaultRpmEmail = repoState.getAgencyDefaultRpmEmail;
      storeTransactionEvent = repoState.storeTransactionEvent;
      markLatestPendingHourPurchasePaid = repoState.markLatestPendingHourPurchasePaid;
      storeProtectedTransactionSuggestion = repoState.storeProtectedTransactionSuggestion;
      snapshotProjectContext = repoState.snapshotProjectContext;
      getProjectState = repoState.getProjectState;
      getPendingSuggestions = repoState.getPendingSuggestions;
      findProjectsByName = repoState.findProjectsByName;
      setProjectArchived = repoState.setProjectArchived;
      replaceProjectRisks = repoState.replaceProjectRisks;
      replaceProjectNotes = repoState.replaceProjectNotes;
      replaceProjectSummary = repoState.replaceProjectSummary;
      replaceProjectCurrentStatus = repoState.replaceProjectCurrentStatus;
      listProjectUpdates = repoState.listProjectUpdates;
      listOutboundDocumentEvents = repoState.listOutboundDocumentEvents;
      listSystemSettings = repoState.listSystemSettings;
      getSystemSetting = repoState.getSystemSetting;
      upsertSystemSetting = repoState.upsertSystemSetting;
      listEmailTemplates = repoState.listEmailTemplates;
      upsertEmailTemplate = repoState.upsertEmailTemplate;
      listInstructions = repoState.listInstructions;
      upsertInstruction = repoState.upsertInstruction;
      recordAdminAuditLog = repoState.recordAdminAuditLog;
      loadProjectDeletionSnapshot = repoState.loadProjectDeletionSnapshot;
      hardDeleteProject = repoState.hardDeleteProject;
      loadUserDeletionSnapshot = repoState.loadUserDeletionSnapshot;
      hardDeleteUser = repoState.hardDeleteUser;
    },
  };
});

describe("processInboundEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repoState.ensureUserProfileRow.mockResolvedValue(undefined);
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
    repoState.findUserByEmail.mockResolvedValue(null);
    repoState.listUsers.mockResolvedValue([]);
    repoState.findProjectByCodeAndUser.mockResolvedValue(null);
    repoState.findProjectByCode.mockResolvedValue(null);
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(null);
    repoState.findProjectByThreadMessageId.mockResolvedValue(null);
    repoState.findProjectsWhereEmailInParticipantList.mockResolvedValue([]);
    repoState.findProjectsOwnedByUser.mockResolvedValue([]);
    repoState.mergeProjectParticipants.mockResolvedValue(undefined);
    repoState.getUserEmailById.mockResolvedValue("user@example.com");
    repoState.getUserEmailsById.mockResolvedValue(["user@example.com"]);
    repoState.appendRecentUpdate.mockResolvedValue(undefined);
    repoState.storeFollowUps.mockResolvedValue(undefined);
    repoState.updateProjectName.mockResolvedValue(undefined);
    repoState.updateProjectLastContactAt.mockResolvedValue("2026-04-21T12:00:00.000Z");
    repoState.createProjectForUser.mockResolvedValue({
      project: { ...defaultMockProject },
      created: true,
    });
    repoState.getActiveRpm.mockResolvedValue("rpm@example.com");
    repoState.addAdditionalEmails.mockResolvedValue(1);
    repoState.addProjectMembersByEmails.mockResolvedValue([]);
    repoState.findLatestPendingCcMembershipConfirmation.mockResolvedValue(null);
    repoState.resolveCcMembershipConfirmation.mockResolvedValue(undefined);
    repoState.findProjectById.mockResolvedValue(defaultMockProject);
    repoState.deactivateActiveRpm.mockResolvedValue(undefined);
    repoState.createOrReusePendingCcMembershipConfirmation.mockResolvedValue({
      id: "cc_1",
      owner_user_id: "u1",
      project_id: "p1",
      owner_email: "user@example.com",
      candidate_emails: ["john@agency.com"],
      status: "pending",
      source_inbound_event_id: "e1",
      source_subject: "subject",
      source_raw_body: "body",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.findLatestPendingApproval.mockResolvedValue(null);
    repoState.createOrReusePendingAdminAction.mockResolvedValue({
      id: "admin_1",
      sender_user_id: "u1",
      sender_email: "daniel@saassquared.com",
      action_kind: "update_tier",
      action_payload: {},
      status: "pending",
      source_subject: "Admin",
      source_raw_body: "Admin",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.findLatestPendingAdminAction.mockResolvedValue(null);
    repoState.resolvePendingAdminAction.mockResolvedValue(undefined);
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
      featureFlags: { collaborators: false, oversight: false },
      transactionHistory: [],
    });
    repoState.getPendingSuggestions.mockResolvedValue([]);
    repoState.setProjectDomain.mockResolvedValue(undefined);
    repoState.getUserProfile.mockResolvedValue(emptyUserProfile);
    repoState.mergeStructuredUserProfileContext.mockResolvedValue(undefined);
    repoState.patchUserProfileContextJson.mockResolvedValue(undefined);
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
    repoState.applyAgencyTierRpmTransition.mockResolvedValue(undefined);
    repoState.getAgencyDefaultRpmEmail.mockResolvedValue(null);
    repoState.storeTransactionEvent.mockResolvedValue({
      paymentTotal: 500,
      paymentCurrency: "usd",
      paymentLinkUrl: "https://pay.saassquared.com/b/mock",
      paymentLinkTierAmount: 500,
    });
    repoState.markLatestPendingHourPurchasePaid.mockResolvedValue(null);
    repoState.approveSuggestion.mockResolvedValue(null);
    repoState.findProjectsByName.mockResolvedValue([]);
    repoState.setProjectArchived.mockResolvedValue(undefined);
    repoState.replaceProjectRisks.mockResolvedValue(undefined);
    repoState.replaceProjectNotes.mockResolvedValue(undefined);
    repoState.replaceProjectSummary.mockResolvedValue(undefined);
    repoState.replaceProjectCurrentStatus.mockResolvedValue(undefined);
    repoState.listProjectUpdates.mockResolvedValue([]);
    repoState.listOutboundDocumentEvents.mockResolvedValue([]);
    repoState.listSystemSettings.mockResolvedValue([]);
    repoState.getSystemSetting.mockResolvedValue(null);
    repoState.upsertSystemSetting.mockImplementation(async (key, valueJson) => ({
      key,
      valueJson,
      previous: null,
    }));
    repoState.listEmailTemplates.mockResolvedValue([]);
    repoState.upsertEmailTemplate.mockImplementation(async (key, patch) => ({
      key,
      subject: patch.subject ?? "",
      textBody: patch.textBody ?? "",
      htmlBody: patch.htmlBody ?? "",
      previous: null,
    }));
    repoState.listInstructions.mockResolvedValue([]);
    repoState.upsertInstruction.mockImplementation(async (key, content) => ({
      key,
      content,
      previous: null,
    }));
    repoState.recordAdminAuditLog.mockResolvedValue(undefined);
    repoState.loadProjectDeletionSnapshot.mockResolvedValue({ project: null, state: null, rpmEmail: null });
    repoState.hardDeleteProject.mockResolvedValue(undefined);
    repoState.loadUserDeletionSnapshot.mockResolvedValue({ user: null, projects: [], emails: [] });
    repoState.hardDeleteUser.mockResolvedValue(undefined);
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(result.recipients).toEqual(["user@example.com"]);
    expect(result.context.projectId).toBe("p1");
    expect(repoState.updateSummaryDisplay).toHaveBeenCalledWith("p1", "hello");
    expect(repoState.updateProjectLastContactAt).toHaveBeenCalledWith("p1");
    expect(result.payload.context.lastContactAt).toBe("2026-04-21T12:00:00.000Z");
    expect(repoState.updateNotes).toHaveBeenCalledWith("p1", [], event.timestamp);
    expect(repoState.mergeStructuredUserProfileContext).toHaveBeenCalled();
    expect(repoState.getPendingSuggestions).toHaveBeenCalledWith("u1", "p1");
  });

  it("falls back to account main email in outbound recipients when project ownerEmail is missing", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    repoState.getUserEmailById.mockResolvedValue("main@agency.com");
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
      ownerEmail: null,
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
      participants: ["member@agency.com"],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "agency",
      featureFlags: { collaborators: true, oversight: true },
      transactionHistory: [],
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_owner_fallback_recipients",
      provider: "resend",
      providerEventId: "m_owner_fallback_recipients",
      timestamp: new Date().toISOString(),
      from: "member@agency.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody: "Update",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    const result = await processInboundEmail(event);
    expect(result.recipients).toContain("main@agency.com");
  });

  it("stores unstructured multi-line body as a single note without duplicating lines from task-intent UNKNOWN", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    const rawBody = "Hi Frank\nI want to build a mobile app to measure the calories";
    const parsed = parseNormalizedContent(rawBody);
    expect(parsed.notes).toEqual([rawBody]);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_one_note_multiline",
      provider: "resend",
      providerEventId: "m_one_note_multiline",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: thread",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
      },
    };

    await processInboundEmail(event);
    expect(repoState.updateNotes).toHaveBeenCalledWith("p1", [rawBody], event.timestamp);
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p1", "Notes updated (1 item).");
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

  it("stores parsed follow-ups as dedicated project records", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_followups",
      provider: "resend",
      providerEventId: "m_followups",
      timestamp: "2026-04-21T12:00:00.000Z",
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Update",
      inReplyTo: null,
      references: [],
      rawBody: "FollowUp:\n- Action: Follow up with John about API access\n- Target: John\n- When: Tomorrow",
      parsed: {
        projectSectionPresence: {
          ...EMPTY_PROJECT_SECTION_PRESENCE,
          followUps: true,
        },
        summary: null,
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        followUps: [
          {
            action: "Follow up with John about API access",
            target: "John",
            whenText: "Tomorrow",
            dueDate: "2026-04-22",
            status: "pending",
          },
        ],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);

    expect(repoState.storeFollowUps).toHaveBeenCalledWith(
      "p1",
      [
        {
          action: "Follow up with John about API access",
          target: "John",
          whenText: "Tomorrow",
          dueDate: "2026-04-22",
          status: "pending",
        },
      ],
      "e_followups",
    );
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith(
      "p1",
      "Follow-up(s) added: Follow up with John about API access",
    );
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.createProjectForUser).toHaveBeenCalledWith("u1", "Restaurant Analytics Saas Weekly", {
      createdByEmail: "user@example.com",
      createdByUserId: "u1",
    });
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.createProjectForUser).toHaveBeenCalledWith("u1", "Salon CRM Booking Reminders", {
      createdByEmail: "user@example.com",
      createdByUserId: "u1",
    });
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.createProjectForUser).toHaveBeenCalledWith("u1", "Platform Managing Client Projects", {
      createdByEmail: "user@example.com",
      createdByUserId: "u1",
    });
    expect(repoState.storeSummary).toHaveBeenCalledWith(
      "p1",
      expect.stringContaining("Project focus: platform for managing client projects across our team."),
    );
  });

  it("derives marketing kickoff name and overview from campaign intent, not greeting", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    repoState.createProjectForUser.mockResolvedValueOnce({
      project: { ...defaultMockProject, kickoff_completed_at: null },
      created: true,
    });
    const rawBody = [
      "Hi Frank,",
      "",
      "This is a marketing project.",
      "We want to launch an outbound lead-generation campaign for our agency.",
      "",
      "Project goal: Book qualified intro calls with potential clients.",
    ].join("\n");

    const event: NormalizedEmailEvent = {
      eventId: "e_create_marketing_campaign",
      provider: "resend",
      providerEventId: "m_create_marketing_campaign",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "new",
      inReplyTo: null,
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.createProjectForUser).toHaveBeenCalledWith("u1", "Outbound Lead-generation Campaign Agency", {
      createdByEmail: "user@example.com",
      createdByUserId: "u1",
    });
    expect(repoState.storeSummary).toHaveBeenCalledWith(
      "p1",
      expect.stringContaining("Project focus: an outbound lead-generation campaign for our agency."),
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
      participants: ["member@example.com"],
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
      participants: ["member@example.com"],
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

  it("requires CC confirmation before collaborator additions on solo package projects", async () => {
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    await expect(processInboundEmail(event)).rejects.toBeInstanceOf(CcMembershipConfirmationRequiredError);
    expect(repoState.createOrReusePendingCcMembershipConfirmation).toHaveBeenCalled();
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    repoState.getProjectState.mockResolvedValue(buildProjectState({ activeRpmEmail: "rpm@example.com" }));
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    const result = await processInboundEmail(event);
    const recentLines = repoState.appendRecentUpdate.mock.calls.map((call) => String(call[1]));
    expect(result.recipients).toContain("rpm@example.com");
    expect(recentLines.some((line) => line.includes("Goals updated:"))).toBe(true);
    expect(recentLines.some((line) => line.includes("Task(s) added:"))).toBe(true);
    expect(recentLines.some((line) => line.includes("Decision(s) added:"))).toBe(true);
    expect(recentLines.some((line) => line.includes("Risk(s) added:"))).toBe(true);
    expect(recentLines.some((line) => line.includes("Notes updated"))).toBe(true);
  });

  it("includes active RPM in recipients when scope changes", async () => {
    repoState.getProjectState.mockResolvedValue(buildProjectState({ activeRpmEmail: "rpm@example.com" }));
    repoState.findProjectByCodeAndUser.mockResolvedValue({ ...defaultMockProject });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_scope_change",
      provider: "resend",
      providerEventId: "m_scope_change",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Update [PJT-A1B2C3D4]",
      inReplyTo: null,
      references: [],
      rawBody: "We are no longer building a mobile app, instead we are building a B2B dashboard.",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    const result = await processInboundEmail(event);
    expect(result.recipients).toContain("rpm@example.com");
    expect(repoState.updateSummaryDisplay).toHaveBeenCalledWith("p1", expect.stringContaining("B2B dashboard"));
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p1", "Scope changed");
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

  it("resolves bare approve to the oldest pending suggestion for the project", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    repoState.findProjectByCodeAndUser.mockResolvedValue({ ...defaultMockProject });
    repoState.getPendingSuggestions.mockResolvedValue([
      {
        id: "oldest-pending",
        userId: "u1",
        projectId: "p1",
        fromEmail: "rpm@example.com",
        content: "User prefers weekly updates",
        status: "pending",
        createdAt: new Date().toISOString(),
        source: "inbound",
      },
    ]);

    const event: NormalizedEmailEvent = {
      eventId: "e_bare_approve",
      provider: "resend",
      providerEventId: "m_bare_approve",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: profile [PJT-A1B2C3D4]",
      inReplyTo: null,
      references: [],
      rawBody: "approve",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        approvals: [{ suggestionId: null, decision: "approve" }],
        additionalEmails: [],
      },
    };

    await processInboundEmail(event);
    expect(repoState.getPendingSuggestions).toHaveBeenCalledWith("u1", "p1");
    expect(repoState.approveSuggestion).toHaveBeenCalledWith("u1", "oldest-pending", "user@example.com");
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

  it("sets outboundMode to rpm_profile_proposal for RPM-only UserProfile Suggestion", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_proposal_only",
      provider: "resend",
      providerEventId: "m_rpm_proposal_only",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Profile suggestion",
      inReplyTo: null,
      references: [],
      rawBody: "UserProfile Suggestion:\nPrefer concise weekly summaries.",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
          content: "Prefer concise weekly summaries.",
          from: "rpm@example.com",
          timestamp: new Date().toISOString(),
        },
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };

    const result = await processInboundEmail(event);
    expect(result.outboundMode).toBe("rpm_profile_proposal");
    expect(result.rpmProfileProposal?.content).toContain("concise weekly");
    expect(result.rpmProfileProposal?.id).toBe("s1");
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    repoState.getProjectState.mockResolvedValue(buildProjectState({ activeRpmEmail: "rpm@example.com" }));
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    const result = await processInboundEmail(event);
    expect(repoState.storeTransactionEvent).toHaveBeenCalledWith(
      "p1",
      "user@example.com",
      expect.objectContaining({
        hoursPurchased: 5,
        hourlyRate: 100,
      }),
    );
    expect(repoState.storeProtectedTransactionSuggestion).not.toHaveBeenCalled();
    expect(result.recipients).toContain("rpm@example.com");
    expect(result.paymentInstructions).toBeDefined();
  });

  it("includes paymentInstructions when a user transaction is recorded", async () => {
    repoState.getProjectState.mockResolvedValue(buildProjectState({ activeRpmEmail: "rpm@example.com" }));
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    repoState.findProjectByCodeAndUser.mockResolvedValue({ ...defaultMockProject });
    const event: NormalizedEmailEvent = {
      eventId: "e_pi",
      provider: "resend",
      providerEventId: "m_pi",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: [PJT-A1B2C3D4] purchase",
      inReplyTo: null,
      references: [],
      rawBody: "Transaction:\nHours Purchased: 5\nHourly Rate: 100",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    const result = await processInboundEmail(event);
    expect(result.recipients).toContain("rpm@example.com");
    expect(result.paymentInstructions).toEqual(
      expect.objectContaining({
        projectCode: "pjt-a1b2c3d4",
        payment: expect.objectContaining({
          paymentTotal: 500,
          paymentLinkUrl: "https://pay.saassquared.com/b/mock",
        }),
        activeRpmEmail: "rpm@example.com",
      }),
    );
    expect(repoState.setUserTier).not.toHaveBeenCalled();
  });

  it("marks latest pending purchase paid and returns paymentConfirmed on Paid from owner", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    repoState.findProjectByCodeAndUser.mockResolvedValue({ ...defaultMockProject });
    repoState.getActiveRpm.mockResolvedValue(null);
    repoState.getProjectState.mockResolvedValue(buildProjectState({ activeRpmEmail: "rpm@example.com" }));
    const paidRecord = {
      id: "tx-paid-1",
      type: "hourPurchase" as const,
      hoursPurchased: 5,
      hourlyRate: 100,
      allocatedHours: 4.5,
      bufferHours: 0.5,
      saas2Fee: 50,
      projectRemainder: 0,
      createdAt: new Date().toISOString(),
      paymentTotal: 500,
      paymentCurrency: "usd",
      paymentLinkUrl: "https://pay.example/b",
      paymentLinkTierAmount: 500,
      paidAt: new Date().toISOString(),
      paymentStatus: "paid" as const,
    };
    repoState.markLatestPendingHourPurchasePaid.mockResolvedValue(paidRecord);

    const event: NormalizedEmailEvent = {
      eventId: "e_paid_ack",
      provider: "resend",
      providerEventId: "m_paid_ack",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: [PJT-A1B2C3D4] payment",
      inReplyTo: null,
      references: [],
      rawBody: "Paid",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        paymentReceivedAck: true,
      },
    };

    const result = await processInboundEmail(event);
    expect(repoState.markLatestPendingHourPurchasePaid).toHaveBeenCalledWith("p1", "user@example.com");
    expect(repoState.setUserTier).toHaveBeenCalledWith("u1", "solopreneur");
    expect(repoState.assignRpm).toHaveBeenCalledWith("p1", expect.any(String), "user@example.com");
    expect(result.recipients).toContain("rpm@example.com");
    expect(result.paymentConfirmed?.plainTextBody).toContain("Payment confirmed.");
    expect(result.paymentConfirmed?.followUpProjectPayload.recordedTransaction).toBeUndefined();
    expect(result.paymentConfirmed?.followUpProjectPayload.context.activeRpmEmail).toBe("rpm@example.com");
    expect(result.paymentInstructions).toBeUndefined();
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.updateProjectName).toHaveBeenCalledWith("p1", "Web Dashboard");
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p1", "Project renamed to: Web Dashboard");
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.updateProjectName).toHaveBeenCalledWith("p1", "Web Dashboard Agencies");
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.updateProjectName).toHaveBeenCalledWith("p-thread", "Shared Spreadsheet Workflow Gyms");
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.updateProjectName).toHaveBeenCalledWith("p-two-sentence", "Shared Spreadsheet Workflow Gyms");
    expect(repoState.updateNotes).toHaveBeenCalledWith(
      "p-two-sentence",
      [expect.stringContaining("Scope changed from a mobile app to a shared spreadsheet workflow for gyms")],
      event.timestamp,
    );
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p-two-sentence", "Scope changed");
  });

  it("does not derive project name from scope when explicit Project Name is present", async () => {
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_scope_explicit_name",
      provider: "resend",
      providerEventId: "m_scope_explicit_name",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Direction change",
      inReplyTo: null,
      references: [],
      rawBody: "Project Name:\n- Custom Pivot Name\n\nWe are no longer doing mobile app for habits, now it's a web dashboard",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        projectName: "Custom Pivot Name",
      },
    };

    await processInboundEmail(event);
    expect(repoState.updateProjectName).toHaveBeenCalledTimes(1);
    expect(repoState.updateProjectName).toHaveBeenCalledWith("p1", "Custom Pivot Name");
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p1", "Project renamed to: Custom Pivot Name");
    expect(repoState.appendRecentUpdate).not.toHaveBeenCalledWith("p1", "Project renamed to: Web Dashboard");
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

  it("requires confirmation when freemium owner includes a new CC on existing project", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(defaultMockProject);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_cc_confirm_needed",
      provider: "resend",
      providerEventId: "m_cc_confirm_needed",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: ["john@agency.com"],
      subject: "Re: update [PJT-A1B2C3D4]",
      inReplyTo: "<thread-existing@saas2.app>",
      references: [],
      rawBody: "Quick note",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    await expect(processInboundEmail(event)).rejects.toBeInstanceOf(CcMembershipConfirmationRequiredError);
    expect(repoState.createOrReusePendingCcMembershipConfirmation).toHaveBeenCalled();
    expect(repoState.mergeProjectParticipants).not.toHaveBeenCalledWith("p1", ["john@agency.com"]);
  });

  it("approves pending CC confirmation on flexible yes reply", async () => {
    repoState.findLatestPendingCcMembershipConfirmation.mockResolvedValue({
      id: "cc_pending_yes",
      owner_user_id: "u1",
      project_id: "p1",
      owner_email: "user@example.com",
      candidate_emails: ["john@agency.com"],
      status: "pending",
      source_inbound_event_id: "evt_old",
      source_subject: "Re: New CRM",
      source_raw_body: "we are building",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.addAdditionalEmails.mockResolvedValue(2);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_cc_yes",
      provider: "resend",
      providerEventId: "m_cc_yes",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: New CRM",
      inReplyTo: "<thread-existing@saas2.app>",
      references: [],
      rawBody: "yes add them please",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.resolveCcMembershipConfirmation).toHaveBeenCalledWith({
      confirmationId: "cc_pending_yes",
      status: "approved",
      resolvedByEmail: "user@example.com",
    });
    expect(repoState.addAdditionalEmails).toHaveBeenCalledWith("u1", []);
    expect(repoState.addProjectMembersByEmails).toHaveBeenCalledWith("p1", "u1", ["john@agency.com"]);
    expect(repoState.setUserTier).toHaveBeenCalledWith("u1", "agency");
    expect(repoState.mergeProjectParticipants).toHaveBeenCalledWith("p1", ["john@agency.com"]);
  });

  it("approves pending CC and adds project member without claiming CC as account alias", async () => {
    repoState.findLatestPendingCcMembershipConfirmation.mockResolvedValue({
      id: "cc_pending_conflict",
      owner_user_id: "u1",
      project_id: "p1",
      owner_email: "user@example.com",
      candidate_emails: ["taken@example.com"],
      status: "pending",
      source_inbound_event_id: "evt_old",
      source_subject: "Re: New CRM",
      source_raw_body: "we are building",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.addAdditionalEmails.mockResolvedValue(1);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_cc_conflict",
      provider: "resend",
      providerEventId: "m_cc_conflict",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: New CRM",
      inReplyTo: "<thread-existing@saas2.app>",
      references: [],
      rawBody: "yes",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.addAdditionalEmails).toHaveBeenCalledWith("u1", []);
    expect(repoState.addProjectMembersByEmails).toHaveBeenCalledWith("p1", "u1", ["taken@example.com"]);
    expect(repoState.resolveCcMembershipConfirmation).toHaveBeenCalledWith({
      confirmationId: "cc_pending_conflict",
      status: "approved",
      resolvedByEmail: "user@example.com",
    });
  });

  it("still blocks explicit Additional Emails alias conflicts", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(defaultMockProject);
    const { AdditionalEmailConflictError } = await import("@/modules/memory/repository");
    repoState.addAdditionalEmails.mockRejectedValue(new AdditionalEmailConflictError("taken@example.com"));

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_additional_email_conflict",
      provider: "resend",
      providerEventId: "m_additional_email_conflict",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update [PJT-A1B2C3D4]",
      inReplyTo: "<thread-existing@saas2.app>",
      references: [],
      rawBody: "Additional Emails:\ntaken@example.com",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        additionalEmails: ["taken@example.com"],
      },
    };

    await expect(processInboundEmail(event)).rejects.toBeInstanceOf(NonRetryableInboundError);
  });

  it("creates deferred kickoff project from stored source email, not from yes reply", async () => {
    const sourceSubject = "Kickoff: Mobile inventory";
    const sourceRawBody =
      "I want to build a mobile app for inventory tracking for retail stores.";
    const expectedName = expectedDerivedProjectName(sourceRawBody, sourceSubject);
    const wrongNameFromConfirmation = expectedDerivedProjectName(
      "Yes, add them please",
      "Re: Confirm collaborators",
    );
    expect(wrongNameFromConfirmation).not.toBe(expectedName);

    repoState.findLatestPendingCcMembershipConfirmation.mockResolvedValue({
      id: "cc_pending_kickoff_yes",
      owner_user_id: "u1",
      project_id: null,
      owner_email: "user@example.com",
      candidate_emails: ["john@agency.com"],
      status: "pending",
      source_inbound_event_id: "evt_kickoff",
      source_subject: sourceSubject,
      source_raw_body: sourceRawBody,
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.addAdditionalEmails.mockResolvedValue(2);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_cc_kickoff_yes",
      provider: "resend",
      providerEventId: "m_cc_kickoff_yes",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Confirm collaborators",
      inReplyTo: "<thread-existing@saas2.app>",
      references: [],
      rawBody: "Yes, add them please",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    expect(repoState.createProjectForUser).toHaveBeenCalledWith("u1", expectedName, {
      createdByEmail: "user@example.com",
      createdByUserId: "u1",
    });
    expect(repoState.storeRawProjectUpdate).toHaveBeenCalledWith(
      "p1",
      sourceRawBody,
      expect.anything(),
    );
    expect(repoState.resolveCcMembershipConfirmation).toHaveBeenCalledWith({
      confirmationId: "cc_pending_kickoff_yes",
      status: "approved",
      resolvedByEmail: "user@example.com",
    });
  });

  it("rejects pending kickoff confirmation on no reply and keeps tier unchanged", async () => {
    repoState.findLatestPendingCcMembershipConfirmation.mockResolvedValue({
      id: "cc_pending_no",
      owner_user_id: "u1",
      project_id: null,
      owner_email: "user@example.com",
      candidate_emails: ["john@agency.com"],
      status: "pending",
      source_inbound_event_id: "evt_old",
      source_subject: "new",
      source_raw_body: "build crm",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_cc_no",
      provider: "resend",
      providerEventId: "m_cc_no",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: new",
      inReplyTo: null,
      references: [],
      rawBody: "No, do not add",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.resolveCcMembershipConfirmation).toHaveBeenCalledWith({
      confirmationId: "cc_pending_no",
      status: "rejected",
      resolvedByEmail: "user@example.com",
    });
    expect(repoState.addAdditionalEmails).toHaveBeenCalledWith("u1", []);
    expect(repoState.setUserTier).not.toHaveBeenCalledWith("u1", "agency");
  });

  it("applies additional CC emails and tier transition to project owner account when sender is a collaborator", async () => {
    const threadProject = {
      ...defaultMockProject,
      id: "p-agency",
      user_id: "u-owner",
      owner_email: "owner@example.com",
    };
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(null);
    repoState.findProjectByThreadMessageId.mockResolvedValue(threadProject);
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u-collab",
        email: "collab@example.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.addAdditionalEmails.mockResolvedValue(2);
    repoState.getProjectState.mockResolvedValue({
      projectId: "p-agency",
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
      featureFlags: { collaborators: true, oversight: true },
      transactionHistory: [],
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_tier_owner",
      provider: "resend",
      providerEventId: "m_tier_owner",
      timestamp: new Date().toISOString(),
      from: "collab@example.com",
      fromDisplayName: null,
      to: [],
      cc: ["newcc@example.com"],
      subject: "Re: Update [PJT-A1B2C3D4]",
      inReplyTo: "<thread-tier@saas2.app>",
      references: [],
      rawBody: "Adding finance",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        additionalEmails: ["newcc@example.com"],
      },
    };

    await processInboundEmail(event);

    expect(repoState.addAdditionalEmails).toHaveBeenCalledWith("u-owner", ["newcc@example.com"]);
    expect(repoState.setUserTier).not.toHaveBeenCalledWith("u-owner", "agency");
  });

  it("continues pending CC approval side effects on duplicate retry events", async () => {
    repoState.registerInboundEvent.mockResolvedValue(false);
    repoState.findLatestPendingCcMembershipConfirmation.mockResolvedValue({
      id: "cc_pending_retry",
      owner_user_id: "u1",
      project_id: "p1",
      owner_email: "user@example.com",
      candidate_emails: ["john@agency.com"],
      status: "pending",
      source_inbound_event_id: "evt_retry",
      source_subject: "Re: New CRM",
      source_raw_body: "build crm",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.addAdditionalEmails.mockResolvedValue(2);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_cc_retry",
      provider: "resend",
      providerEventId: "m_cc_retry",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: New CRM",
      inReplyTo: "<thread-existing@saas2.app>",
      references: [],
      rawBody: "yes",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    expect(repoState.addAdditionalEmails).toHaveBeenCalledWith("u1", []);
    expect(repoState.setUserTier).toHaveBeenCalledWith("u1", "agency");
    expect(repoState.resolveCcMembershipConfirmation).toHaveBeenCalledWith({
      confirmationId: "cc_pending_retry",
      status: "approved",
      resolvedByEmail: "user@example.com",
    });
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

  it("includes active RPM in recipients when tier has human oversight", async () => {
    repoState.getProjectState.mockResolvedValue(
      buildProjectState({
        tier: "solopreneur",
        featureFlags: { collaborators: false, oversight: true },
        activeRpmEmail: "rpm@example.com",
      }),
    );
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_recip_rpm",
      provider: "resend",
      providerEventId: "m_recip_rpm",
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
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(result.recipients.sort()).toEqual(["rpm@example.com", "user@example.com"].sort());
  });

  it("merges inferred memory to project owner when inbound sender is RPM", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject, user_id: "u1" });
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u-rpm",
        email: "rpm@example.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const rawBody = `Notes:
- Client wants a retail analytics SaaS MVP.

UserProfile:
Prefer concise updates.
`;
    const parsed = parseNormalizedContent(rawBody);
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_infer",
      provider: "resend",
      providerEventId: "m_rpm_infer",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: [PJT-A1B2C3D4]",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };
    await processInboundEmail(event);
    expect(repoState.mergeStructuredUserProfileContext).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ project_type: "SaaS" }),
    );
  });

  it("records RPM Correction lines when sender is the assigned RPM", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u-rpm",
        email: "rpm@example.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_corr",
      provider: "resend",
      providerEventId: "m_rpm_corr",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: Update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody: "Correction:\nThe launch window is 4 weeks, not 2.\n",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
        correction: "The launch window is 4 weeks, not 2.",
      },
    };
    await processInboundEmail(event);
    expect(repoState.updateNotes).toHaveBeenCalledWith(
      "p1",
      expect.arrayContaining(["RPM correction: The launch window is 4 weeks, not 2."]),
      event.timestamp,
    );
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith(
      "p1",
      expect.stringContaining("RPM correction recorded:"),
    );
  });

  it("does not assign default RPM at kickoff when owner tier is freemium", async () => {
    repoState.getActiveRpm.mockResolvedValue(null);
    repoState.createProjectForUser.mockResolvedValueOnce({
      project: { ...defaultMockProject, kickoff_completed_at: null },
      created: true,
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const rawBody = "I want to build a small tool for tracking invoices.";
    const event: NormalizedEmailEvent = {
      eventId: "e_kickoff_free",
      provider: "resend",
      providerEventId: "m_kickoff_free",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "New idea",
      inReplyTo: null,
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.assignRpm).not.toHaveBeenCalled();
  });

  it("assigns default RPM at kickoff when owner tier is solopreneur", async () => {
    repoState.getActiveRpm.mockResolvedValue(null);
    repoState.createProjectForUser.mockResolvedValueOnce({
      project: { ...defaultMockProject, kickoff_completed_at: null },
      created: true,
    });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
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
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "solopreneur",
      featureFlags: { collaborators: false, oversight: true },
      transactionHistory: [],
    });
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u1",
        email: "user@example.com",
        display_name: null,
        tier: "solopreneur",
        created_at: new Date().toISOString(),
      },
      created: true,
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const rawBody = "I want to build a billing reminder app.";
    const event: NormalizedEmailEvent = {
      eventId: "e_kickoff_solo",
      provider: "resend",
      providerEventId: "m_kickoff_solo",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "New project",
      inReplyTo: null,
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.assignRpm).toHaveBeenCalled();
  });

  it("does not assign master user as RPM at agency kickoff when agency default RPM is unset", async () => {
    repoState.getActiveRpm.mockResolvedValue(null);
    repoState.createProjectForUser.mockResolvedValueOnce({
      project: { ...defaultMockProject, kickoff_completed_at: null },
      created: true,
    });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
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
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "agency",
      featureFlags: { collaborators: true, oversight: true },
      transactionHistory: [],
    });
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u1",
        email: "user@example.com",
        display_name: null,
        tier: "agency",
        created_at: new Date().toISOString(),
      },
      created: true,
    });
    repoState.getAgencyDefaultRpmEmail.mockResolvedValue(null);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const rawBody = "I want a client portal for our agency.";
    const event: NormalizedEmailEvent = {
      eventId: "e_kickoff_agency",
      provider: "resend",
      providerEventId: "m_kickoff_agency",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "New project",
      inReplyTo: null,
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.assignRpm).not.toHaveBeenCalled();
  });

  it("assigns agency default RPM at kickoff when tier is agency and default is configured", async () => {
    repoState.getActiveRpm.mockResolvedValue(null);
    repoState.createProjectForUser.mockResolvedValueOnce({
      project: { ...defaultMockProject, kickoff_completed_at: null },
      created: true,
    });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
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
      notes: [],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "agency",
      featureFlags: { collaborators: true, oversight: true },
      transactionHistory: [],
    });
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u1",
        email: "user@example.com",
        display_name: null,
        tier: "agency",
        created_at: new Date().toISOString(),
      },
      created: true,
    });
    repoState.getAgencyDefaultRpmEmail.mockResolvedValue("agency-rpm@example.com");
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const rawBody = "I want a client portal for our agency.";
    const event: NormalizedEmailEvent = {
      eventId: "e_kickoff_agency_rpm",
      provider: "resend",
      providerEventId: "m_kickoff_agency_rpm",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "New project",
      inReplyTo: null,
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    expect(repoState.assignRpm).toHaveBeenCalledWith("p1", "agency-rpm@example.com", "system@saas2.app");
  });

  it("assigns RPM from Assign RPM block when agency owner sends inbound", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    repoState.getActiveRpm.mockResolvedValue(null);
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u1",
        email: "user@example.com",
        display_name: null,
        tier: "agency",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
      ownerEmail: "user@example.com",
      summary: "s",
      initialSummary: "s",
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
      planPackage: "agency",
      featureFlags: { collaborators: true, oversight: true },
      transactionHistory: [],
    });
    const body = "Assign RPM:\nnewrpm@agency.com\n";
    const parsed = parseNormalizedContent(body);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_assign_rpm_block",
      provider: "resend",
      providerEventId: "m_assign_rpm_block",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody: body,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };
    await processInboundEmail(event);
    expect(repoState.assignRpm).toHaveBeenCalledWith("p1", "newrpm@agency.com", "user@example.com");
    expect(repoState.appendRecentUpdate).toHaveBeenCalledWith("p1", "RPM assigned: newrpm@agency.com");
  });

  it("does not assign RPM from Assign RPM block when sender is not owner or master", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    repoState.getActiveRpm.mockResolvedValue(null);
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u1",
        email: "user@example.com",
        display_name: null,
        tier: "agency",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
      ownerEmail: "user@example.com",
      summary: "s",
      initialSummary: "s",
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
      planPackage: "agency",
      featureFlags: { collaborators: true, oversight: true },
      transactionHistory: [],
    });
    const body = "Assign RPM:\nnewrpm@agency.com\n";
    const parsed = parseNormalizedContent(body);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_assign_rpm_collab",
      provider: "resend",
      providerEventId: "m_assign_rpm_collab",
      timestamp: new Date().toISOString(),
      from: "collab@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody: body,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };
    repoState.assignRpm.mockClear();
    await processInboundEmail(event);
    expect(repoState.assignRpm).not.toHaveBeenCalled();
  });

  it("allows account main owner to assign RPM on member-created project when ownerEmail is missing", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject, user_id: "u-owner" });
    repoState.getActiveRpm.mockResolvedValue(null);
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u-owner",
        email: "owner@example.com",
        display_name: null,
        tier: "agency",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.getUserEmailById.mockResolvedValue("owner@example.com");
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u-owner",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
      ownerEmail: null,
      summary: "s",
      initialSummary: "s",
      currentStatus: "",
      goals: [],
      actionItems: [],
      completedTasks: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
      participants: ["member@agency.com", "owner@example.com"],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "agency",
      planPackage: "agency",
      featureFlags: { collaborators: true, oversight: true },
      transactionHistory: [],
    });

    const body = "Assign RPM:\nnewrpm@agency.com\n";
    const parsed = parseNormalizedContent(body);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_assign_rpm_owner_fallback",
      provider: "resend",
      providerEventId: "m_assign_rpm_owner_fallback",
      timestamp: new Date().toISOString(),
      from: "owner@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody: body,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };

    await processInboundEmail(event);
    expect(repoState.assignRpm).toHaveBeenCalledWith("p1", "newrpm@agency.com", "owner@example.com");
  });

  it("does not allow collaborator RPM assignment when ownerEmail is missing but account owner is resolvable", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject, user_id: "u-owner" });
    repoState.getActiveRpm.mockResolvedValue(null);
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u-collab",
        email: "collab@example.com",
        display_name: null,
        tier: "agency",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.getUserEmailById.mockResolvedValue("owner@example.com");
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u-owner",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
      ownerEmail: null,
      summary: "s",
      initialSummary: "s",
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
      planPackage: "agency",
      featureFlags: { collaborators: true, oversight: true },
      transactionHistory: [],
    });

    const body = "Assign RPM:\nnewrpm@agency.com\n";
    const parsed = parseNormalizedContent(body);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_assign_rpm_collab_owner_fallback",
      provider: "resend",
      providerEventId: "m_assign_rpm_collab_owner_fallback",
      timestamp: new Date().toISOString(),
      from: "collab@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody: body,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };

    await processInboundEmail(event);
    expect(repoState.assignRpm).not.toHaveBeenCalled();
  });

  it("throws rpm_structured_project clarification when RPM sends unstructured body on existing project", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const rawBody =
      "We should pivot the roadmap and tighten scope without any labeled sections for the parser to latch onto.";
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_unstructured",
      provider: "resend",
      providerEventId: "m_rpm_unstructured",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update [PJT-A1B2C3D4]",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody,
      parsed: {
        ...parseNormalizedContent(rawBody),
      },
    };
    await expect(processInboundEmail(event)).rejects.toMatchObject({
      name: "ClarificationRequiredError",
      clarificationKind: "rpm_structured_project",
      intentReason: "rpm_unstructured_project_update",
    });
    expect(repoState.storeRawProjectUpdate).not.toHaveBeenCalled();
  });

  it("calls replaceGoals for RPM when Goals section is present on existing project", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    const rawBody = "Goals:\n- Get 10 users\n- Ship MVP\n";
    const parsed = parseNormalizedContent(rawBody);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_goals_replace",
      provider: "resend",
      providerEventId: "m_rpm_goals_replace",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };
    repoState.replaceGoals.mockClear();
    repoState.updateGoals.mockClear();
    await processInboundEmail(event);
    expect(repoState.replaceGoals).toHaveBeenCalledWith("p1", ["Get 10 users", "Ship MVP"]);
    expect(repoState.updateGoals).not.toHaveBeenCalled();
  });

  it("calls replaceGoals for owner when Goals section is present", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    const rawBody = "Goals:\n- Owner goal\n";
    const parsed = parseNormalizedContent(rawBody);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_owner_goals_replace",
      provider: "resend",
      providerEventId: "m_owner_goals_replace",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };
    repoState.replaceGoals.mockClear();
    repoState.updateGoals.mockClear();
    await processInboundEmail(event);
    expect(repoState.replaceGoals).toHaveBeenCalledWith("p1", ["Owner goal"]);
    expect(repoState.updateGoals).not.toHaveBeenCalled();
  });

  it("calls replaceActionItems for RPM when Tasks section is present on existing project", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    const rawBody = "Tasks:\n- Wire API\n- Update dashboard\n";
    const parsed = parseNormalizedContent(rawBody);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_tasks_replace",
      provider: "resend",
      providerEventId: "m_rpm_tasks_replace",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };
    repoState.replaceActionItems.mockClear();
    repoState.appendActionItems.mockClear();
    await processInboundEmail(event);
    expect(repoState.replaceActionItems).toHaveBeenCalledWith("p1", ["Wire API", "Update dashboard"]);
    expect(repoState.appendActionItems).not.toHaveBeenCalled();
  });

  it("calls replaceActionItems with empty list when RPM sends Tasks heading with no bullets", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    const rawBody = "Tasks:\n";
    const parsed = parseNormalizedContent(rawBody);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_rpm_tasks_clear",
      provider: "resend",
      providerEventId: "m_rpm_tasks_clear",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };
    repoState.replaceActionItems.mockClear();
    repoState.appendActionItems.mockClear();
    await processInboundEmail(event);
    expect(repoState.replaceActionItems).toHaveBeenCalledWith("p1", []);
    expect(repoState.appendActionItems).not.toHaveBeenCalled();
  });

  it("calls replaceActionItems for owner when Tasks section is present", async () => {
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue({ ...defaultMockProject });
    const rawBody = "Tasks:\n- Owner task\n";
    const parsed = parseNormalizedContent(rawBody);
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_owner_tasks_replace",
      provider: "resend",
      providerEventId: "m_owner_tasks_replace",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "Re: update",
      inReplyTo: "<thread@saas2.app>",
      references: [],
      rawBody,
      parsed: {
        projectSectionPresence: parsed.projectSectionPresence,
        summary: parsed.summary,
        currentStatus: parsed.currentStatus,
        goals: parsed.goals,
        actionItems: parsed.actionItems,
        completedTasks: parsed.completedTasks,
        decisions: parsed.decisions,
        risks: parsed.risks,
        recommendations: parsed.recommendations,
        notes: parsed.notes,
        userProfileContext: parsed.userProfileContext,
        rpmSuggestion: parsed.rpmSuggestion,
        transactionEvent: parsed.transactionEvent,
        approvals: parsed.approvals,
        additionalEmails: parsed.additionalEmails,
        projectName: parsed.projectName,
        correction: parsed.correction,
        assignRpmEmail: parsed.assignRpmEmail,
      },
    };
    repoState.replaceActionItems.mockClear();
    repoState.appendActionItems.mockClear();
    await processInboundEmail(event);
    expect(repoState.replaceActionItems).toHaveBeenCalledWith("p1", ["Owner task"]);
    expect(repoState.appendActionItems).not.toHaveBeenCalled();
  });

  it("always includes sender in recipients when owner email is unavailable", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValue({
      user: {
        id: "u1",
        email: "member@example.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.getUserEmailById.mockResolvedValue(null);
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
      ownerEmail: null,
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
      participants: ["member@example.com"],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "freemium",
      featureFlags: { collaborators: false, oversight: false },
      transactionHistory: [],
    });
    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_sender_fallback_recipient",
      provider: "resend",
      providerEventId: "m_sender_fallback_recipient",
      timestamp: new Date().toISOString(),
      from: "member@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "New project",
      inReplyTo: null,
      references: [],
      rawBody: "I want to start a new project",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    const result = await processInboundEmail(event);
    expect(result.recipients).toContain("member@example.com");
  });

  it("allows account alias sender even when owner email is missing on project state", async () => {
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
    repoState.getUserEmailById.mockResolvedValue(null);
    repoState.getUserEmailsById.mockResolvedValue(["user@example.com", "member@example.com"]);
    repoState.getProjectState.mockResolvedValue({
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
      ownerEmail: null,
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
      featureFlags: { collaborators: false, oversight: false },
      transactionHistory: [],
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const event: NormalizedEmailEvent = {
      eventId: "e_alias_sender_allowed",
      provider: "resend",
      providerEventId: "m_alias_sender_allowed",
      timestamp: new Date().toISOString(),
      from: "member@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "New project",
      inReplyTo: null,
      references: [],
      rawBody: "I want to start a new project for lead tracking",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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

    const result = await processInboundEmail(event);
    expect(result.context.projectId).toBe("p1");
    expect(result.recipients).toContain("member@example.com");
  });

  it("returns the admin menu for the master sender without creating a project", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValueOnce({
      user: {
        id: "u-admin",
        email: "daniel@saassquared.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findLatestPendingAdminAction.mockResolvedValueOnce(null);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const result = await processInboundEmail({
      eventId: "e-admin-menu",
      provider: "resend",
      providerEventId: "m-admin-menu",
      timestamp: new Date().toISOString(),
      from: "daniel@saassquared.com",
      fromDisplayName: "Daniel",
      to: ["frank@saas2.app"],
      cc: [],
      subject: "Admin",
      inReplyTo: null,
      references: [],
      rawBody: "Admin",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    });

    expect(result.outboundMode).toBe("admin");
    expect(result.context.projectId).toBeNull();
    expect(result.adminReply?.text).toContain("Admin Menu");
    expect(repoState.createProjectForUser).not.toHaveBeenCalled();
    expect(repoState.findLatestPendingCcMembershipConfirmation).not.toHaveBeenCalled();
  });

  it("confirms a pending admin tier update and executes it", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValueOnce({
      user: {
        id: "u-admin",
        email: "daniel@saassquared.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findLatestPendingAdminAction.mockResolvedValueOnce({
      id: "admin_1",
      sender_user_id: "u-admin",
      sender_email: "daniel@saassquared.com",
      action_kind: "update_tier",
      action_payload: {
        userEmail: "john@example.com",
        tier: "agency",
      },
      status: "pending",
      source_subject: "Admin",
      source_raw_body: "Make john@example.com an agency",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.findUserByEmail.mockResolvedValueOnce({
      id: "u-target",
      email: "john@example.com",
      display_name: null,
      tier: "freemium",
      created_at: new Date().toISOString(),
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const result = await processInboundEmail({
      eventId: "e-admin-confirm",
      provider: "resend",
      providerEventId: "m-admin-confirm",
      timestamp: new Date().toISOString(),
      from: "daniel@saassquared.com",
      fromDisplayName: "Daniel",
      to: ["frank@saas2.app"],
      cc: [],
      subject: "Re: Admin",
      inReplyTo: null,
      references: [],
      rawBody: "CONFIRM",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    });

    expect(repoState.setUserTier).toHaveBeenCalledWith("u-target", "agency");
    expect(repoState.applyAgencyTierRpmTransition).toHaveBeenCalledWith("u-target");
    expect(repoState.resolvePendingAdminAction).toHaveBeenCalledWith({
      actionId: "admin_1",
      status: "executed",
      resolvedByEmail: "daniel@saassquared.com",
    });
    expect(result.outboundMode).toBe("admin");
    expect(result.adminReply?.text).toContain("john@example.com is now an Agency user");
  });

  it("confirms a pending admin RPM assignment for a specific project only", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValueOnce({
      user: {
        id: "u-admin",
        email: "daniel@saassquared.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findLatestPendingAdminAction.mockResolvedValueOnce({
      id: "admin_2",
      sender_user_id: "u-admin",
      sender_email: "daniel@saassquared.com",
      action_kind: "assign_rpm",
      action_payload: {
        userEmail: "john@example.com",
        rpmEmail: "rpm@example.com",
        projectName: "Target Project",
      },
      status: "pending",
      source_subject: "Admin",
      source_raw_body: "Assign john@example.com to rpm@example.com for project Target Project",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.findUserByEmail.mockResolvedValueOnce({
      id: "u-target",
      email: "john@example.com",
      display_name: null,
      tier: "freemium",
      created_at: new Date().toISOString(),
    });
    repoState.findProjectsOwnedByUser.mockResolvedValueOnce([
      {
        ...defaultMockProject,
        id: "p-target",
        user_id: "u-target",
        project_code: "pjt-deadbeef",
        name: "Target Project",
      },
    ]);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const result = await processInboundEmail({
      eventId: "e-admin-assign",
      provider: "resend",
      providerEventId: "m-admin-assign",
      timestamp: new Date().toISOString(),
      from: "daniel@saassquared.com",
      fromDisplayName: "Daniel",
      to: ["frank@saas2.app"],
      cc: [],
      subject: "Re: Admin",
      inReplyTo: null,
      references: [],
      rawBody: "CONFIRM",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    });

    expect(repoState.assignRpm).toHaveBeenCalledTimes(1);
    expect(repoState.assignRpm).toHaveBeenCalledWith("p-target", "rpm@example.com", "daniel@saassquared.com");
    expect(repoState.resolvePendingAdminAction).toHaveBeenCalledWith({
      actionId: "admin_2",
      status: "executed",
      resolvedByEmail: "daniel@saassquared.com",
    });
    expect(result.adminReply?.text).toContain("Project: Target Project");
  });

  it("confirms a pending admin RPM removal for a specific project only", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValueOnce({
      user: {
        id: "u-admin",
        email: "daniel@saassquared.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findLatestPendingAdminAction.mockResolvedValueOnce({
      id: "admin_3",
      sender_user_id: "u-admin",
      sender_email: "daniel@saassquared.com",
      action_kind: "remove_rpm",
      action_payload: {
        userEmail: "john@example.com",
        projectName: "Target Project",
      },
      status: "pending",
      source_subject: "Admin",
      source_raw_body: "Remove the RPM from john@example.com for project Target Project",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.findUserByEmail.mockResolvedValueOnce({
      id: "u-target",
      email: "john@example.com",
      display_name: null,
      tier: "freemium",
      created_at: new Date().toISOString(),
    });
    repoState.findProjectsOwnedByUser.mockResolvedValueOnce([
      {
        ...defaultMockProject,
        id: "p-target",
        user_id: "u-target",
        project_code: "pjt-feedface",
        name: "Target Project",
      },
    ]);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const result = await processInboundEmail({
      eventId: "e-admin-remove",
      provider: "resend",
      providerEventId: "m-admin-remove",
      timestamp: new Date().toISOString(),
      from: "daniel@saassquared.com",
      fromDisplayName: "Daniel",
      to: ["frank@saas2.app"],
      cc: [],
      subject: "Re: Admin",
      inReplyTo: null,
      references: [],
      rawBody: "CONFIRM",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    });

    expect(repoState.deactivateActiveRpm).toHaveBeenCalledTimes(1);
    expect(repoState.deactivateActiveRpm).toHaveBeenCalledWith("p-target");
    expect(repoState.resolvePendingAdminAction).toHaveBeenCalledWith({
      actionId: "admin_3",
      status: "executed",
      resolvedByEmail: "daniel@saassquared.com",
    });
    expect(result.adminReply?.text).toContain("RPM removed from john@example.com");
    expect(result.adminReply?.text).toContain("Project: Target Project");
  });

  it("creates a pending delete_user admin action and returns the permanent-delete confirmation", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValueOnce({
      user: {
        id: "u-admin",
        email: "daniel@saassquared.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findLatestPendingAdminAction.mockResolvedValueOnce(null);
    repoState.createOrReusePendingAdminAction.mockResolvedValueOnce({
      id: "admin_delete_user",
      sender_user_id: "u-admin",
      sender_email: "daniel@saassquared.com",
      action_kind: "delete_user",
      action_payload: { userEmail: "victim@example.com" },
      status: "pending",
      source_subject: "Admin",
      source_raw_body: "Delete user victim@example.com",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const result = await processInboundEmail({
      eventId: "e-admin-delete-user",
      provider: "resend",
      providerEventId: "m-admin-delete-user",
      timestamp: new Date().toISOString(),
      from: "daniel@saassquared.com",
      fromDisplayName: "Daniel",
      to: ["frank@saas2.app"],
      cc: [],
      subject: "Admin",
      inReplyTo: null,
      references: [],
      rawBody: "Delete user victim@example.com",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    });

    expect(repoState.createOrReusePendingAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        senderEmail: "daniel@saassquared.com",
        actionKind: "delete_user",
        actionPayload: { userEmail: "victim@example.com" },
      }),
    );
    expect(result.outboundMode).toBe("admin");
    expect(result.adminReply?.text).toContain("Delete user (permanent)");
    expect(result.adminReply?.text).toContain("victim@example.com");
    expect(result.adminReply?.text).toContain('Reply "CONFIRM"');
    expect(repoState.hardDeleteUser).not.toHaveBeenCalled();
  });

  it("blocks deletion of the master admin email at staging time without creating a pending action", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValueOnce({
      user: {
        id: "u-admin",
        email: "daniel@saassquared.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findLatestPendingAdminAction.mockResolvedValueOnce(null);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const result = await processInboundEmail({
      eventId: "e-admin-delete-master",
      provider: "resend",
      providerEventId: "m-admin-delete-master",
      timestamp: new Date().toISOString(),
      from: "daniel@saassquared.com",
      fromDisplayName: "Daniel",
      to: ["frank@saas2.app"],
      cc: [],
      subject: "Admin",
      inReplyTo: null,
      references: [],
      rawBody: "Delete user daniel@saassquared.com",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    });

    expect(result.outboundMode).toBe("admin");
    expect(result.adminReply?.text.toLowerCase()).toContain("master");
    expect(repoState.createOrReusePendingAdminAction).not.toHaveBeenCalled();
    expect(repoState.hardDeleteUser).not.toHaveBeenCalled();
  });

  it("confirms a pending delete_user action and executes the hard delete", async () => {
    repoState.getOrCreateUserByEmail.mockResolvedValueOnce({
      user: {
        id: "u-admin",
        email: "daniel@saassquared.com",
        display_name: null,
        tier: "freemium",
        created_at: new Date().toISOString(),
      },
      created: false,
    });
    repoState.findLatestPendingAdminAction.mockResolvedValueOnce({
      id: "admin_delete_user_confirm",
      sender_user_id: "u-admin",
      sender_email: "daniel@saassquared.com",
      action_kind: "delete_user",
      action_payload: { userEmail: "victim@example.com" },
      status: "pending",
      source_subject: "Admin",
      source_raw_body: "Delete user victim@example.com",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.findUserByEmail.mockResolvedValueOnce({
      id: "u-victim",
      email: "victim@example.com",
      display_name: null,
      tier: "freemium",
      created_at: new Date().toISOString(),
    });
    const snapshot = {
      user: { id: "u-victim", email: "victim@example.com", tier: "freemium" },
      projects: [
        { id: "p-1", name: "Alpha", project_code: "PJT-AAA111", status: "active", archived_at: null },
      ],
      emails: [{ email: "victim@example.com", is_primary: true }],
    };
    repoState.loadUserDeletionSnapshot.mockResolvedValueOnce(snapshot);

    const { processInboundEmail } = await import("@/modules/orchestration/processInboundEmail");
    const result = await processInboundEmail({
      eventId: "e-admin-delete-user-confirm",
      provider: "resend",
      providerEventId: "m-admin-delete-user-confirm",
      timestamp: new Date().toISOString(),
      from: "daniel@saassquared.com",
      fromDisplayName: "Daniel",
      to: ["frank@saas2.app"],
      cc: [],
      subject: "Re: Admin",
      inReplyTo: null,
      references: [],
      rawBody: "CONFIRM",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
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
    });

    expect(repoState.findUserByEmail).toHaveBeenCalledWith("victim@example.com");
    expect(repoState.loadUserDeletionSnapshot).toHaveBeenCalledWith("u-victim");
    expect(repoState.hardDeleteUser).toHaveBeenCalledWith("u-victim");
    expect(repoState.recordAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKind: "delete_user",
        entityType: "user",
        entityRef: "victim@example.com",
        adminActionId: "admin_delete_user_confirm",
        beforeJson: snapshot,
        afterJson: null,
      }),
    );
    expect(repoState.resolvePendingAdminAction).toHaveBeenCalledWith({
      actionId: "admin_delete_user_confirm",
      status: "executed",
      resolvedByEmail: "daniel@saassquared.com",
    });
    expect(result.outboundMode).toBe("admin");
    expect(result.adminReply?.text).toMatch(/permanently deleted/i);
  });

});
