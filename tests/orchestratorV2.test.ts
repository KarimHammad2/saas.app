import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";

const processInboundEmail = vi.fn();
const sendProjectEmail = vi.fn();

vi.mock("@/modules/memory/repository", () => ({
  MemoryRepository: class {
    storeOutboundThreadMapping = vi.fn();
    recordOutboundEmailEvent = vi.fn();
  },
}));

vi.mock("@/modules/orchestration/processInboundEmail", () => ({
  processInboundEmail,
}));

vi.mock("@/modules/output/sendProjectEmail", () => ({
  sendProjectEmail,
}));

describe("handleIncomingEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    processInboundEmail.mockResolvedValue({
      recipients: ["user@example.com"],
      payload: {
        context: {
          projectId: "p1",
          userId: "u1",
          projectStatus: "active",
          summary: "hello",
          currentStatus: "",
          goals: [],
          actionItems: [],
          completedTasks: [],
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
      outboundMode: "full",
      rpmProfileProposal: null,
      context: {
        userId: "u1",
        projectId: "p1",
        eventId: "evt1",
        duplicate: false,
      },
    });
    sendProjectEmail.mockResolvedValue({ outboundMessageId: "out-id", outboundMessageIds: ["out-id"] });
  });

  it("normalizes legacy payload and executes canonical loop", async () => {
    const { handleIncomingEmail } = await import("@/src/orchestration/orchestrator");

    const result = await handleIncomingEmail({
      senderEmail: "user@example.com",
      subject: "Update",
      body: "Goals:\n- Launch MVP",
    });

    const event = processInboundEmail.mock.calls[0]?.[0] as NormalizedEmailEvent;
    expect(event.from).toBe("user@example.com");
    expect(event.subject).toBe("Update");
    expect(event.parsed.goals).toContain("Launch MVP");
    expect(sendProjectEmail).toHaveBeenCalledOnce();
    expect(result).toEqual({ userId: "u1", projectId: "p1", duplicate: false, clarificationSent: false });
  });
});
