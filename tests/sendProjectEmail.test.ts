import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectEmailPayload } from "@/modules/output/types";

vi.mock("@/modules/email/sendEmail", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/modules/config/runtimeConfig", async () => {
  const actual = (await vi.importActual<typeof import("@/modules/config/runtimeConfig")>("@/modules/config/runtimeConfig")) as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    getRuntimeConfig: vi.fn(),
  };
});

import { getRuntimeConfig } from "@/modules/config/runtimeConfig";
import { sendEmail } from "@/modules/email/sendEmail";

const mockedGetRuntimeConfig = vi.mocked(getRuntimeConfig);
const mockedSendEmail = vi.mocked(sendEmail);

function buildPayload(isWelcome: boolean): ProjectEmailPayload {
  return {
    isWelcome,
    context: {
      projectId: "p1",
      userId: "u1",
      summary: "AI SaaS for real estate",
      initialSummary: "AI SaaS for real estate",
      currentStatus: "MVP in progress",
      goals: ["lead generation", "automation"],
      actionItems: ["launch landing page"],
      completedTasks: [],
      decisions: ["Ship weekly"],
      risks: ["timeline slippage"],
      recommendations: [],
      notes: ["User wants lead gen + automation."],
      participants: [],
      recentUpdatesLog: [],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 1,
      tier: "freemium",
      transactionHistory: [],
    },
    pendingSuggestions: [],
    nextSteps: ["Reply with updates."],
  };
}

describe("sendProjectEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetRuntimeConfig.mockResolvedValue({
      adminBccEnabled: false,
      adminBccAddress: null,
      llmInstruction: "Use attached document.",
      projectUpdateTemplate: {
        subject: "Update Subject",
        textBody: "Update: {{summary}}",
        htmlBody: "<p>Update</p>",
      },
      projectKickoffTemplate: {
        subject: "Kickoff Subject",
        textBody: "Kickoff: {{summary}}",
        htmlBody: "<p>Kickoff</p>",
      },
      projectWelcomeTemplate: {
        subject: "Welcome Subject",
        textBody: "Welcome!",
        htmlBody: "<p>Welcome</p>",
      },
      projectReminderTemplate: {
        subject: "Reminder Subject",
        textBody: "Reminder: {{summary}}",
        htmlBody: "<p>Reminder</p>",
      },
    });
  });

  it("uses fixed subject and minimal body for kickoff (emailKind from payload)", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(true);
    await sendProjectEmail(["user@example.com"], payload);

    expect(mockedSendEmail).toHaveBeenCalledOnce();
    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Project Update — AI SaaS for real estate");
    expect(call?.headers?.["X-SaaS2-Message-Type"]).toBe("project-kickoff");

    const attachment = call?.attachments?.find((a) => a.filename === "project-document.md");
    expect(attachment?.content).toContain("# PROJECT FILE");
    expect(attachment?.content).toContain("## Instructions to LLM");
    expect(attachment?.content).toContain("## Goals");
    expect(attachment?.content).toContain("### In Progress");
    expect(attachment?.content).toContain("### Completed");

    expect(call?.html).toContain('charset="utf-8"');
    expect(call?.html).toContain('class="email-root"');
    expect(call?.html).toContain("project-document.md");
    expect(call?.html).toContain("<strong>Project:</strong> AI SaaS for real estate");
    expect(call?.html).toContain("<strong>Status:</strong> In Progress");
    expect(call?.html).toContain("<strong>Last Update:</strong> N/A");
    expect(call?.html).toContain("You are working on:");
    expect(call?.text).toContain("Here is your updated project file.");
    expect(call?.text).toContain("Project: AI SaaS for real estate");
    expect(call?.text).toContain("Status: In Progress");
    expect(call?.text).toContain("Last Update: N/A");
    expect(call?.text).toContain('You are working on:\n"AI SaaS for real estate"');
    expect(call?.text).toContain("Attachment: project-document.md");
    expect(call?.text).not.toContain("{{summary}}");
  });

  it("uses fixed subject for update", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Project Update — AI SaaS for real estate");
    expect(call?.html).toContain("Here is your updated project file.");
    expect(call?.text).toContain("Project: AI SaaS for real estate");
  });

  it("uses reminder message type when emailKind=reminder", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    payload.emailKind = "reminder";
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Project Update — AI SaaS for real estate");
    expect(call?.headers?.["X-SaaS2-Message-Type"]).toBe("project-reminder");
  });

  it("includes pending suggestions only inside RPM context when passed (document is LLM-first)", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    payload.pendingSuggestions = [
      {
        id: "s1",
        userId: "u1",
        projectId: "p1",
        fromEmail: "rpm@example.com",
        content: "User prefers short answers",
        status: "pending",
        createdAt: new Date().toISOString(),
        source: "inbound",
      },
    ];
    payload.context.transactionHistory = [
      {
        id: "tx1",
        type: "hourPurchase",
        hoursPurchased: 10,
        hourlyRate: 50,
        allocatedHours: 9,
        bufferHours: 1,
        saas2Fee: 50,
        projectRemainder: 0,
        createdAt: new Date().toISOString(),
      },
    ];

    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    const attachment = call?.attachments?.find((a) => a.filename === "project-document.md");
    expect(attachment?.content).toContain("# PROJECT FILE");
    expect(attachment?.content).not.toContain("Pending Suggestions");
    expect(attachment?.content).not.toContain("Transactions");
    expect(call?.html).not.toContain("Pending Suggestions");
  });

  it("shows placeholders when lists are empty", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    payload.context.goals = [];
    payload.context.actionItems = [];
    payload.context.risks = [];
    payload.context.notes = [];
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    const attachment = call?.attachments?.find((a) => a.filename === "project-document.md");
    expect(attachment?.content).toContain("(none)");
  });

  it("appends project code to subject when present", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    payload.context.projectCode = "pjt-deadbeef";
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Project Update — AI SaaS for real estate [PJT-DEADBEEF]");
  });

  it("uses deterministic fallback values for title/status/last update", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    payload.context.summary = "";
    payload.context.projectName = "";
    payload.context.actionItems = [];
    payload.context.completedTasks = [];
    payload.context.goals = [];
    payload.context.recentUpdatesLog = [];
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Project Update — Untitled project");
    expect(call?.text).toContain("Project: Untitled project");
    expect(call?.text).toContain("Status: Unknown");
    expect(call?.text).toContain("Last Update: N/A");
  });
});
