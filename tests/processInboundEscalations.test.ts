import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEmailEvent, ProjectContext } from "@/modules/contracts/types";
import { sendEmail } from "@/modules/email/sendEmail";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";

vi.mock("@/modules/email/sendEmail", () => ({
  sendEmail: vi.fn(),
}));

const mockedSendEmail = vi.mocked(sendEmail);

const baseProjectRecord = {
  id: "p1",
  user_id: "u1",
  owner_email: "user@example.com",
  name: "Alpha Project",
  status: "active",
  project_code: "pjt-a1b2c3d4",
  remainder_balance: 0,
  reminder_balance: 0,
  usage_count: 0,
  kickoff_completed_at: new Date().toISOString(),
  last_contact_at: null,
  created_at: new Date().toISOString(),
};

const baseProjectState: ProjectContext = {
  projectId: "p1",
  userId: "u1",
  projectCode: "pjt-a1b2c3d4",
  projectName: "Alpha Project",
  projectStatus: "active",
  ownerEmail: "user@example.com",
  summary: "Need more staffing support.",
  initialSummary: "Need more staffing support.",
  currentStatus: "needs-help",
  goals: ["Launch the next release"],
  actionItems: ["Finalize scope"],
  completedTasks: [],
  decisions: [],
  risks: ["Capacity risk"],
  recommendations: [],
  notes: [],
  participants: [],
  recentUpdatesLog: [],
  remainderBalance: 0,
  reminderBalance: 0,
  usageCount: 0,
  tier: "agency",
  featureFlags: { collaborators: true, oversight: true },
  transactionHistory: [],
  activeRpmEmail: "rpm@example.com",
};

const repoState = {
  registerInboundEvent: vi.fn(),
  getOrCreateUserByEmail: vi.fn(),
  findLatestPendingApproval: vi.fn(),
  resolvePendingApproval: vi.fn(),
  findLatestPendingCcMembershipConfirmation: vi.fn(),
  ensureUserProfileRow: vi.fn(),
  findProjectByThreadMessageIdForUser: vi.fn(),
  findProjectByThreadMessageId: vi.fn(),
  getUserEmailById: vi.fn(),
  getUserEmailsById: vi.fn(),
  getProjectState: vi.fn(),
  getActiveRpm: vi.fn(),
  createEscalationLog: vi.fn(),
  createReviewFlag: vi.fn(),
  createPendingApproval: vi.fn(),
};

vi.mock("@/modules/memory/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/memory/repository")>("@/modules/memory/repository");
  return {
    ...actual,
    MemoryRepository: class {
      registerInboundEvent = repoState.registerInboundEvent;
      getOrCreateUserByEmail = repoState.getOrCreateUserByEmail;
      findLatestPendingApproval = repoState.findLatestPendingApproval;
      resolvePendingApproval = repoState.resolvePendingApproval;
      findLatestPendingCcMembershipConfirmation = repoState.findLatestPendingCcMembershipConfirmation;
      ensureUserProfileRow = repoState.ensureUserProfileRow;
      findProjectByThreadMessageIdForUser = repoState.findProjectByThreadMessageIdForUser;
      findProjectByThreadMessageId = repoState.findProjectByThreadMessageId;
      getUserEmailById = repoState.getUserEmailById;
      getUserEmailsById = repoState.getUserEmailsById;
      getProjectState = repoState.getProjectState;
      getActiveRpm = repoState.getActiveRpm;
      createEscalationLog = repoState.createEscalationLog;
      createReviewFlag = repoState.createReviewFlag;
      createPendingApproval = repoState.createPendingApproval;
    },
  };
});

describe("processInboundEmail escalation routing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedSendEmail.mockResolvedValue(undefined);
    repoState.registerInboundEvent.mockResolvedValue(true);
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
    repoState.findLatestPendingApproval.mockResolvedValue(null);
    repoState.findLatestPendingCcMembershipConfirmation.mockResolvedValue(null);
    repoState.ensureUserProfileRow.mockResolvedValue(undefined);
    repoState.findProjectByThreadMessageIdForUser.mockResolvedValue(baseProjectRecord);
    repoState.findProjectByThreadMessageId.mockResolvedValue(null);
    repoState.getUserEmailById.mockResolvedValue("user@example.com");
    repoState.getUserEmailsById.mockResolvedValue(["user@example.com"]);
    repoState.getProjectState.mockResolvedValue(baseProjectState);
    repoState.getActiveRpm.mockResolvedValue("rpm@example.com");
    repoState.createEscalationLog.mockResolvedValue({
      id: "log_1",
      project_id: "p1",
      type: "RPM",
      reason: "User is unsure about next steps",
      created_at: new Date().toISOString(),
    });
    repoState.createReviewFlag.mockResolvedValue({
      id: "flag_1",
      project_id: "p1",
      reason: "Tasks conflict with goals",
      status: "pending_review",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    repoState.createPendingApproval.mockResolvedValue({
      id: "approval_1",
      action: "hire_developer",
      reason: "Hiring decision requires approval",
      status: "pending",
      rpm_email: "rpm@example.com",
      project_id: "p1",
      requested_by_email: "user@example.com",
      source_subject: "",
      source_raw_body: "",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
  });

  it("notifies the rpm when an escalation block requests RPM help", async () => {
    const event: NormalizedEmailEvent = {
      provider: "resend",
      providerEventId: "evt_rpm",
      eventId: "evt_rpm",
      from: "user@example.com",
      fromDisplayName: "User",
      subject: "Project update",
      rawBody: `Escalation:
Type: RPM
Reason: User is unsure about next steps`,
      parsed: {
        summary: "Need more staffing support.",
        projectSectionPresence: {} as never,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        additionalEmails: [],
        approvals: [],
        transactionEvent: null,
        paymentReceivedAck: false,
        projectStatus: null,
        currentStatus: null,
        userProfileContext: null,
        rpmSuggestion: null,
        correction: null,
        assignRpmEmail: null,
        projectName: null,
      },
      timestamp: new Date().toISOString(),
      attachments: [],
      inReplyTo: "msg-1",
      references: [],
      cc: [],
    } as NormalizedEmailEvent;

    const result = await processInboundEmail(event);

    expect(result.outboundMode).toBe("escalation");
    expect(result.escalationAction?.type).toBe("RPM");
    expect(result.escalationAction?.notification?.recipients).toEqual(["rpm@example.com"]);
    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "rpm@example.com",
        subject: "Escalation: User needs help",
      }),
    );
    expect(repoState.createEscalationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RPM",
        reason: "User is unsure about next steps",
        projectId: "p1",
      }),
    );
  });

  it("resolves a pending approval reply before normal processing", async () => {
    repoState.findLatestPendingApproval.mockResolvedValueOnce({
      id: "approval_1",
      action: "hire_developer",
      reason: "Hiring decision requires approval",
      status: "pending",
      rpm_email: "rpm@example.com",
      project_id: "p1",
      requested_by_email: "user@example.com",
      source_subject: "",
      source_raw_body: "",
      resolved_by_email: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    });

    const event: NormalizedEmailEvent = {
      provider: "resend",
      providerEventId: "evt_approval",
      eventId: "evt_approval",
      from: "rpm@example.com",
      fromDisplayName: "RPM",
      subject: "Approval reply",
      rawBody: "APPROVE",
      parsed: {
        summary: "",
        projectSectionPresence: {} as never,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: [],
        additionalEmails: [],
        approvals: [],
        transactionEvent: null,
        paymentReceivedAck: false,
        projectStatus: null,
        currentStatus: null,
        userProfileContext: null,
        rpmSuggestion: null,
        correction: null,
        assignRpmEmail: null,
        projectName: null,
      },
      timestamp: new Date().toISOString(),
      attachments: [],
      inReplyTo: null,
      references: [],
      cc: [],
    } as NormalizedEmailEvent;

    const result = await processInboundEmail(event);

    expect(result.outboundMode).toBe("admin");
    expect(result.adminReply?.text).toContain("Approval approve recorded.");
    expect(repoState.resolvePendingApproval).toHaveBeenCalledWith({
      approvalId: "approval_1",
      status: "approved",
      resolvedByEmail: "rpm@example.com",
    });
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });
});
