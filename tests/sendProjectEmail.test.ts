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
      decisions: ["Ship weekly"],
      risks: ["timeline slippage"],
      recommendations: [],
      notes: ["User wants lead gen + automation."],
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

  it("uses kickoff template when isWelcome=true", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(true);
    await sendProjectEmail(["user@example.com"], payload);

    expect(mockedSendEmail).toHaveBeenCalledOnce();
    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Kickoff Subject");
    expect(call?.headers?.["X-SaaS2-Message-Type"]).toBe("project-kickoff");

    const attachment = call?.attachments?.find((a) => a.filename === "project-document.md");
    expect(attachment?.content).toContain("# Overview");
    expect(attachment?.content).toContain("# Next Steps");
    expect(attachment?.content).toContain("# Goals");
    expect(attachment?.content).toContain("# Tasks");
    expect(attachment?.content).toContain("# Risks");
    expect(attachment?.content).toContain("# Decisions");
    expect(attachment?.content).toContain("# Notes");
    expect(attachment?.content).not.toContain("# Getting Started");
    expect(attachment?.content).not.toContain("# Initial Structure");
    expect(attachment?.content).not.toContain("# Project Progress");

    expect(call?.html).toContain('charset="utf-8"');
    expect(call?.html).toContain('class="email-root"');
    expect(call?.html).toContain("project-document.md");
    expect(call?.html).not.toContain("<pre>");
    expect(call?.text).toContain("Full project document: see attachment project-document.md");
    expect(call?.text).toContain("Use attached document.");
    expect(call?.text).not.toContain("# Overview");
  });

  it("uses update template when isWelcome=false", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Update Subject");
    expect(call?.html).toContain('charset="utf-8"');
    expect(call?.html).not.toContain("<pre>");
    expect(call?.text).toContain("Update: AI SaaS for real estate");
    expect(call?.text).toContain("Full project document: see attachment project-document.md");
    expect(call?.text).not.toContain("# Goals");
  });

  it("uses reminder template when emailKind=reminder", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    payload.emailKind = "reminder";
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Reminder Subject");
    expect(call?.headers?.["X-SaaS2-Message-Type"]).toBe("project-reminder");
  });

  it("includes pending suggestions and transactions when present", async () => {
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
    expect(attachment?.content).toContain("# Pending Suggestions");
    expect(attachment?.content).toContain("Here are a few things to think about next:");
    expect(attachment?.content).toContain("- User prefers short answers");
    expect(attachment?.content).not.toContain("s1");
    expect(attachment?.content).toContain("# Transactions");
    expect(attachment?.content).toContain("User share: $450.00");
    expect(attachment?.content).toContain("Platform share: $50.00");
    expect(call?.html).toContain("<h1>Pending Suggestions</h1>");
    expect(call?.html).toContain("Here are a few things to think about next:");
    expect(call?.html).toContain("<ul>");
    expect(call?.html).toContain("<h1>Transactions</h1>");
  });

  it("shows conversational guided placeholders and realistic early completeness", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    payload.context.goals = [];
    payload.context.actionItems = [];
    payload.context.risks = [];
    payload.context.notes = [];
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    const attachment = call?.attachments?.find((a) => a.filename === "project-document.md");
    expect(attachment?.content).toContain("(No goals yet. Define your first 2-3 goals.)");
    expect(attachment?.content).toContain("(No tasks yet. List the first tasks to get started.)");
    expect(attachment?.content).toContain("(No risks tracked yet. Note the main blockers to watch.)");
    expect(attachment?.content).toContain("- Completeness: 0%");
    expect(attachment?.content).not.toContain("Planning Execution");
    expect(call?.html).toContain("(No goals yet. Define your first 2-3 goals.)");
  });

  it("uses restaurant-aware kickoff guidance and shows project identity", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(true);
    payload.context.summary = "SaaS platform for restaurants";
    payload.context.goals = [];
    payload.context.actionItems = [];
    payload.context.risks = [];
    payload.context.notes = [];
    payload.context.projectName = "Restaurant SaaS";
    payload.context.ownerDisplayName = "Karim";
    payload.context.ownerEmail = "karim@example.com";

    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    const attachment = call?.attachments?.find((a) => a.filename === "project-document.md");
    expect(attachment?.content).toContain("Project: Restaurant SaaS");
    expect(attachment?.content).toContain("Owner: Karim <karim@example.com>");
    expect(attachment?.content).toContain("Define how restaurants will use your SaaS");
    expect(attachment?.content).toContain("(No goals yet. Define how restaurants will use your SaaS");
    expect(call?.html).toContain("<strong>Project:</strong> Restaurant SaaS");
    expect(call?.html).toContain("<strong>Owner:</strong> Karim &lt;karim@example.com&gt;");
  });
});

