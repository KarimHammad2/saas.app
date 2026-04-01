import { beforeEach, describe, expect, it, vi } from "vitest";

const listProjectsForReminder = vi.fn();
const getProjectState = vi.fn();
const getPendingSuggestions = vi.fn();
const reserveReminderSlot = vi.fn();
const releaseReminderSlot = vi.fn();
const storeOutboundThreadMapping = vi.fn();
const sendProjectEmail = vi.fn();

vi.mock("@/modules/memory/repository", () => ({
  MemoryRepository: class {
    listProjectsForReminder = listProjectsForReminder;
    getProjectState = getProjectState;
    getPendingSuggestions = getPendingSuggestions;
    reserveReminderSlot = reserveReminderSlot;
    releaseReminderSlot = releaseReminderSlot;
    storeOutboundThreadMapping = storeOutboundThreadMapping;
  },
}));

vi.mock("@/modules/output/sendProjectEmail", () => ({
  sendProjectEmail,
}));

vi.mock("@/modules/config/runtimeConfig", () => ({
  getRuntimeConfig: vi.fn().mockResolvedValue({
    adminBccEnabled: false,
    adminBccAddress: null,
    llmInstruction: "x",
    projectUpdateTemplate: { subject: "U", textBody: "{{summary}}", htmlBody: "<p>x</p>" },
    projectKickoffTemplate: { subject: "K", textBody: "k", htmlBody: "<p>k</p>" },
    projectWelcomeTemplate: { subject: "W", textBody: "w", htmlBody: "<p>w</p>" },
    projectReminderTemplate: { subject: "R", textBody: "{{summary}}", htmlBody: "<p>r</p>" },
  }),
  renderProjectUpdateTemplate: vi.fn(),
}));

describe("GET /api/cron/reminders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CRON_SECRET", "secret-test");
    listProjectsForReminder.mockResolvedValue([]);
    reserveReminderSlot.mockResolvedValue("2026-03-27T00:00:00.000Z");
    sendProjectEmail.mockResolvedValue({ outboundMessageId: "reminder-out-id" });
  });

  it("returns 401 without bearer token", async () => {
    const { GET } = await import("@/app/api/cron/reminders/route");
    const res = await GET(new Request("http://localhost/api/cron/reminders"));
    expect(res.status).toBe(401);
  });

  it("returns 200 when authorized and processes candidates", async () => {
    listProjectsForReminder.mockResolvedValue([
      {
        projectId: "p1",
        userId: "u1",
        userEmail: "user@example.com",
        projectName: "Primary Project",
        reminderBalance: 3,
      },
    ]);
    getProjectState.mockResolvedValue({
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
    });
    getPendingSuggestions.mockResolvedValue([]);

    const { GET } = await import("@/app/api/cron/reminders/route");
    const res = await GET(
      new Request("http://localhost/api/cron/reminders", {
        headers: { authorization: "Bearer secret-test" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number; candidates: number };
    expect(body.sent).toBe(1);
    expect(body.candidates).toBe(1);
    expect(sendProjectEmail).toHaveBeenCalledOnce();
    expect(sendProjectEmail).toHaveBeenCalledWith(["user@example.com"], expect.objectContaining({ emailKind: "reminder" }));
    expect(storeOutboundThreadMapping).toHaveBeenCalledWith("reminder-out-id", "p1");
    expect(reserveReminderSlot).toHaveBeenCalledWith("p1", 7);
    expect(releaseReminderSlot).not.toHaveBeenCalled();
  });

  it("releases reserved reminder slot when sending fails", async () => {
    listProjectsForReminder.mockResolvedValue([
      {
        projectId: "p1",
        userId: "u1",
        userEmail: "user@example.com",
        projectName: "Primary Project",
        reminderBalance: 3,
      },
    ]);
    getProjectState.mockResolvedValue({
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
    });
    getPendingSuggestions.mockResolvedValue([]);
    reserveReminderSlot.mockResolvedValue("2026-03-27T10:00:00.000Z");
    sendProjectEmail.mockRejectedValue(new Error("smtp down"));

    const { GET } = await import("@/app/api/cron/reminders/route");
    const res = await GET(
      new Request("http://localhost/api/cron/reminders", {
        headers: { authorization: "Bearer secret-test" },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number; candidates: number };
    expect(body.sent).toBe(0);
    expect(body.candidates).toBe(1);
    expect(releaseReminderSlot).toHaveBeenCalledWith("p1", "2026-03-27T10:00:00.000Z");
  });
});
