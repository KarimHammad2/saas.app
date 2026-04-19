import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyUserProfileContext } from "@/modules/contracts/types";
import type { InboundProcessingResult } from "@/modules/orchestration/processInboundEmail";
import { CcMembershipConfirmationRequiredError, ClarificationRequiredError, OutboundEmailDeliveryError } from "@/modules/orchestration/errors";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";
import { sendRpmProfileProposalEmail } from "@/modules/output/sendRpmProfileProposalEmail";
import { sendCcMembershipConfirmationEmail, sendClarificationEmail, sendPdfResubmissionEmail } from "@/modules/orchestration/sendClarificationEmail";
import { handleInboundEmailEvent } from "@/modules/orchestration/handleInboundEmail";

const { storeOutboundThreadMapping, recordOutboundEmailEvent } = vi.hoisted(() => ({
  storeOutboundThreadMapping: vi.fn(),
  recordOutboundEmailEvent: vi.fn(),
}));

vi.mock("@/modules/memory/repository", () => ({
  MemoryRepository: class {
    storeOutboundThreadMapping = storeOutboundThreadMapping;
    recordOutboundEmailEvent = recordOutboundEmailEvent;
  },
}));

vi.mock("@/modules/orchestration/processInboundEmail", () => ({
  processInboundEmail: vi.fn(),
}));

vi.mock("@/modules/output/sendProjectEmail", () => ({
  sendProjectEmail: vi.fn(),
}));

vi.mock("@/modules/output/sendRpmProfileProposalEmail", () => ({
  sendRpmProfileProposalEmail: vi.fn(),
}));

vi.mock("@/modules/orchestration/sendClarificationEmail", () => ({
  sendCcMembershipConfirmationEmail: vi.fn(),
  sendClarificationEmail: vi.fn(),
  sendPdfResubmissionEmail: vi.fn(),
}));

const mockedProcessInboundEmail = vi.mocked(processInboundEmail);
const mockedSendProjectEmail = vi.mocked(sendProjectEmail);
const mockedSendRpmProfileProposalEmail = vi.mocked(sendRpmProfileProposalEmail);
const mockedSendClarificationEmail = vi.mocked(sendClarificationEmail);
const mockedSendPdfResubmissionEmail = vi.mocked(sendPdfResubmissionEmail);
const mockedSendCcMembershipConfirmationEmail = vi.mocked(sendCcMembershipConfirmationEmail);

describe("handleInboundEmailEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedSendProjectEmail.mockResolvedValue({ outboundMessageId: "outbound-test-msg-id" });
    mockedSendRpmProfileProposalEmail.mockResolvedValue({ outboundMessageId: "rpm-proposal-msg-id" });
  });

  it("sends project email for non-duplicate inbound events", async () => {
    const result: InboundProcessingResult = {
      recipients: ["owner@example.com"],
      payload: {
        context: {
          projectId: "p1",
          userId: "u1",
          projectStatus: "active",
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
          tier: "freemium",
          transactionHistory: [],
        },
        userProfile: emptyUserProfileContext(),
        pendingSuggestions: [],
        nextSteps: [],
        isWelcome: false,
        emailKind: "update",
      },
      outboundMode: "full",
      rpmProfileProposal: null,
      context: {
        userId: "u1",
        projectId: "p1",
        eventId: "evt_1",
        duplicate: false,
      },
    };
    mockedProcessInboundEmail.mockResolvedValue(result);

    const response = await handleInboundEmailEvent({} as never);

    expect(response).toMatchObject({ userId: "u1", projectId: "p1", duplicate: false });
    expect(mockedSendProjectEmail).toHaveBeenCalledWith(result.recipients, result.payload);
    expect(mockedSendRpmProfileProposalEmail).not.toHaveBeenCalled();
    expect(storeOutboundThreadMapping).toHaveBeenCalledWith("outbound-test-msg-id", "p1");
    expect(recordOutboundEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        userId: "u1",
        status: "sent",
      }),
    );
  });

  it("does not send project email for duplicate inbound events", async () => {
    const result: InboundProcessingResult = {
      recipients: ["owner@example.com"],
      payload: {
        context: {
          projectId: "p1",
          userId: "u1",
          projectStatus: "active",
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
          tier: "freemium",
          transactionHistory: [],
        },
        userProfile: emptyUserProfileContext(),
        pendingSuggestions: [],
        nextSteps: [],
        isWelcome: false,
        emailKind: "update",
      },
      outboundMode: "full",
      rpmProfileProposal: null,
      context: {
        userId: "u1",
        projectId: "p1",
        eventId: "evt_1",
        duplicate: true,
      },
    };
    mockedProcessInboundEmail.mockResolvedValue(result);

    const response = await handleInboundEmailEvent({} as never);

    expect(response).toMatchObject({ userId: "u1", projectId: "p1", duplicate: true });
    expect(mockedSendProjectEmail).not.toHaveBeenCalled();
    expect(mockedSendRpmProfileProposalEmail).not.toHaveBeenCalled();
  });

  it("throws typed outbound error when send fails", async () => {
    const result: InboundProcessingResult = {
      recipients: ["owner@example.com"],
      payload: {
        context: {
          projectId: "p1",
          userId: "u1",
          projectStatus: "active",
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
          tier: "freemium",
          transactionHistory: [],
        },
        userProfile: emptyUserProfileContext(),
        pendingSuggestions: [],
        nextSteps: [],
        isWelcome: false,
        emailKind: "update",
      },
      outboundMode: "full",
      rpmProfileProposal: null,
      context: {
        userId: "u1",
        projectId: "p1",
        eventId: "evt_1",
        duplicate: false,
      },
    };
    mockedProcessInboundEmail.mockResolvedValue(result);
    mockedSendProjectEmail.mockRejectedValue(new Error("provider unavailable"));

    await expect(handleInboundEmailEvent({} as never)).rejects.toBeInstanceOf(OutboundEmailDeliveryError);
    expect(recordOutboundEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        userId: "u1",
        status: "failed",
      }),
    );
  });

  it("sends clarification email for low-context inbound and does not send project document", async () => {
    const clarificationError = new ClarificationRequiredError("clarification required", {
      senderEmail: "user@example.com",
      senderSubject: "quick update",
      intentReason: "insufficient project-intent signals",
    });
    mockedProcessInboundEmail.mockRejectedValue(clarificationError);

    const response = await handleInboundEmailEvent({} as never);

    expect(response).toMatchObject({
      userId: null,
      projectId: null,
      clarificationSent: true,
    });
    expect(mockedSendClarificationEmail).toHaveBeenCalledWith("user@example.com", "quick update");
    expect(mockedSendProjectEmail).not.toHaveBeenCalled();
    expect(mockedSendRpmProfileProposalEmail).not.toHaveBeenCalled();
  });

  it("sends owner-only CC confirmation prompt when process requires collaborator confirmation", async () => {
    mockedProcessInboundEmail.mockRejectedValue(
      new CcMembershipConfirmationRequiredError("cc confirmation required", {
        ownerEmail: "owner@example.com",
        senderSubject: "Re: New CRM",
        candidateEmails: ["john@agency.com"],
        confirmationId: "cc-confirm-1",
      }),
    );

    const response = await handleInboundEmailEvent({} as never);

    expect(response).toMatchObject({
      userId: null,
      projectId: null,
      clarificationSent: true,
    });
    expect(mockedSendCcMembershipConfirmationEmail).toHaveBeenCalledWith({
      recipientEmail: "owner@example.com",
      originalSubject: "Re: New CRM",
      candidateEmails: ["john@agency.com"],
    });
    expect(mockedSendProjectEmail).not.toHaveBeenCalled();
  });

  it("sends PDF resubmission email and skips inbound processing when attachment is PDF", async () => {
    const response = await handleInboundEmailEvent({
      from: "user@example.com",
      subject: "Please review this",
      attachments: [{ filename: "scope.pdf", contentType: "application/pdf", isPdf: true }],
    } as never);

    expect(response).toMatchObject({
      userId: null,
      projectId: null,
      duplicate: false,
      clarificationSent: true,
    });
    expect(mockedSendPdfResubmissionEmail).toHaveBeenCalledWith("user@example.com", "Please review this");
    expect(mockedProcessInboundEmail).not.toHaveBeenCalled();
    expect(mockedSendProjectEmail).not.toHaveBeenCalled();
    expect(mockedSendRpmProfileProposalEmail).not.toHaveBeenCalled();
  });

  it("sends lightweight RPM profile proposal email without project attachment", async () => {
    const suggestion = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      userId: "u1",
      projectId: "p1",
      fromEmail: "rpm@example.com",
      content: "The user prefers short weekly summaries.",
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      source: "inbound" as const,
    };
    const result: InboundProcessingResult = {
      recipients: ["owner@example.com", "rpm@example.com"],
      payload: {
        context: {
          projectId: "p1",
          userId: "u1",
          projectCode: "pjt-a1b2c3d4",
          projectName: "Demo",
          ownerEmail: "owner@example.com",
          projectStatus: "active",
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
          tier: "solopreneur",
          transactionHistory: [],
        },
        userProfile: emptyUserProfileContext(),
        pendingSuggestions: [suggestion],
        nextSteps: [],
        isWelcome: false,
        emailKind: "update",
      },
      outboundMode: "rpm_profile_proposal",
      rpmProfileProposal: suggestion,
      context: {
        userId: "u1",
        projectId: "p1",
        eventId: "evt_prop",
        duplicate: false,
      },
    };
    mockedProcessInboundEmail.mockResolvedValue(result);

    await handleInboundEmailEvent({ provider: "resend" } as never);

    expect(mockedSendRpmProfileProposalEmail).toHaveBeenCalledOnce();
    expect(mockedSendRpmProfileProposalEmail).toHaveBeenCalledWith({
      ownerEmail: "owner@example.com",
      context: result.payload.context,
      suggestion,
    });
    expect(mockedSendProjectEmail).not.toHaveBeenCalled();
    expect(storeOutboundThreadMapping).toHaveBeenCalledWith("rpm-proposal-msg-id", "p1");
    expect(recordOutboundEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "rpm-profile-proposal",
        status: "sent",
        recipientCount: 1,
      }),
    );
  });
});
