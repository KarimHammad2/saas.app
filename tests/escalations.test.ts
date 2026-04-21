import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/modules/email/sendEmail";
import {
  buildApprovalWaitReply,
  escalateToRPM,
  flagForReview,
  parseApprovalDecision,
  parseEscalationBlock,
  requestHumanApproval,
} from "@/modules/orchestration/escalations";

vi.mock("@/modules/email/sendEmail", () => ({
  sendEmail: vi.fn(),
}));

const mockedSendEmail = vi.mocked(sendEmail);

describe("escalation helpers", () => {
  const repo = {
    createEscalationLog: vi.fn(),
    createReviewFlag: vi.fn(),
    createPendingApproval: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    repo.createEscalationLog.mockResolvedValue({
      id: "log_1",
      project_id: "p1",
      type: "RPM",
      reason: "Test reason",
      created_at: "2026-04-21T00:00:00.000Z",
    });
    repo.createReviewFlag.mockResolvedValue({
      id: "flag_1",
      project_id: "p1",
      reason: "Test reason",
      status: "pending_review",
      resolved_by_email: null,
      resolved_at: null,
      created_at: "2026-04-21T00:00:00.000Z",
    });
    repo.createPendingApproval.mockResolvedValue({
      id: "approval_1",
      action: "hire_developer",
      reason: "Test reason",
      status: "pending",
      rpm_email: "rpm@example.com",
      project_id: "p1",
      requested_by_email: "sender@example.com",
      source_subject: "",
      source_raw_body: "",
      resolved_by_email: null,
      resolved_at: null,
      created_at: "2026-04-21T00:00:00.000Z",
    });
    mockedSendEmail.mockResolvedValue(undefined);
  });

  it("parses escalation blocks and approval decisions", () => {
    expect(
      parseEscalationBlock(`Escalation:
Type: RPM
Reason: User is unsure about next steps`),
    ).toEqual({ type: "RPM", reason: "User is unsure about next steps" });
    expect(parseApprovalDecision("APPROVE")).toBe("approve");
    expect(parseApprovalDecision("reject")).toBe("reject");
    expect(parseApprovalDecision("approve suggestion 1")).toBeNull();
  });

  it("logs escalation reasons and flags review items", async () => {
    await expect(
      flagForReview(repo as never, {
        projectId: "p1",
        reason: "Tasks conflict with goals",
      }),
    ).resolves.toMatchObject({
      id: "flag_1",
      status: "pending_review",
    });
    expect(repo.createEscalationLog).toHaveBeenCalledWith({
      type: "Review",
      reason: "Tasks conflict with goals",
      projectId: "p1",
    });
    expect(repo.createReviewFlag).toHaveBeenCalledWith({
      projectId: "p1",
      reason: "Tasks conflict with goals",
    });
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it("escalates to the rpm immediately", async () => {
    await expect(
      escalateToRPM(repo as never, {
        projectId: "p1",
        rpmEmail: "rpm@example.com",
        reason: "User is unsure about next steps",
        projectSummary: "Project: Alpha\nSummary: Needs guidance",
        senderEmail: "sender@example.com",
      }),
    ).resolves.toMatchObject({
      notification: {
        recipients: ["rpm@example.com"],
        subject: "Escalation: User needs help",
      },
    });
    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "rpm@example.com",
        subject: "Escalation: User needs help",
        allowMasterUserAsDirectRecipient: true,
      }),
    );
  });

  it("creates a pending approval and notifies the rpm", async () => {
    await expect(
      requestHumanApproval(repo as never, {
        projectId: "p1",
        rpmEmail: "rpm@example.com",
        action: "hire_developer",
        reason: "Hiring decision requires approval",
        projectSummary: "Project: Alpha",
        senderEmail: "sender@example.com",
      }),
    ).resolves.toMatchObject({
      approval: { id: "approval_1", status: "pending" },
      notification: {
        recipients: ["rpm@example.com"],
      },
    });
    expect(repo.createPendingApproval).toHaveBeenCalledWith({
      action: "hire_developer",
      reason: "Hiring decision requires approval",
      status: "pending",
      rpmEmail: "rpm@example.com",
      projectId: "p1",
      requestedByEmail: "sender@example.com",
      sourceSubject: "",
      sourceRawBody: "",
    });
    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "rpm@example.com",
        subject: "Approval requested: Hire Developer",
        allowMasterUserAsDirectRecipient: true,
      }),
    );
  });

  it("builds a clear approval wait reply", () => {
    expect(buildApprovalWaitReply("hire_developer", "Hiring decision requires approval")).toMatchObject({
      subject: "Re: Approval requested: Hire Developer",
    });
  });
});
