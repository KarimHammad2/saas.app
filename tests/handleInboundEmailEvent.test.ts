import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InboundProcessingResult } from "@/modules/orchestration/processInboundEmail";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";
import { handleInboundEmailEvent } from "@/modules/orchestration/handleInboundEmail";

vi.mock("@/modules/orchestration/processInboundEmail", () => ({
  processInboundEmail: vi.fn(),
}));

vi.mock("@/modules/output/sendProjectEmail", () => ({
  sendProjectEmail: vi.fn(),
}));

const mockedProcessInboundEmail = vi.mocked(processInboundEmail);
const mockedSendProjectEmail = vi.mocked(sendProjectEmail);

describe("handleInboundEmailEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
          decisions: [],
          risks: [],
          recommendations: [],
          notes: [],
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
          decisions: [],
          risks: [],
          recommendations: [],
          notes: [],
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
});
