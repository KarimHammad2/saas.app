import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InboundProcessingResult } from "@/modules/orchestration/processInboundEmail";
import { ClarificationRequiredError, OutboundEmailDeliveryError } from "@/modules/orchestration/errors";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";
import { sendClarificationEmail } from "@/modules/orchestration/sendClarificationEmail";
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

vi.mock("@/modules/orchestration/sendClarificationEmail", () => ({
  sendClarificationEmail: vi.fn(),
}));

const mockedProcessInboundEmail = vi.mocked(processInboundEmail);
const mockedSendProjectEmail = vi.mocked(sendProjectEmail);
const mockedSendClarificationEmail = vi.mocked(sendClarificationEmail);

describe("handleInboundEmailEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedSendProjectEmail.mockResolvedValue({ outboundMessageId: "outbound-test-msg-id" });
  });

  it("sends project email for non-duplicate inbound events", async () => {
    const result: InboundProcessingResult = {
      recipients: ["owner@example.com"],
      payload: {
        context: {
          projectId: "p1",
          userId: "u1",
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
        pendingSuggestions: [],
        nextSteps: [],
        isWelcome: false,
        emailKind: "update",
      },
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
        pendingSuggestions: [],
        nextSteps: [],
        isWelcome: false,
        emailKind: "update",
      },
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
  });

  it("throws typed outbound error when send fails", async () => {
    const result: InboundProcessingResult = {
      recipients: ["owner@example.com"],
      payload: {
        context: {
          projectId: "p1",
          userId: "u1",
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
        pendingSuggestions: [],
        nextSteps: [],
        isWelcome: false,
        emailKind: "update",
      },
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
  });
});
