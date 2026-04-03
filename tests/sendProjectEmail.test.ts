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
      projectCode: "pjt-a1b2c3d4",
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
    expect(call?.subject).toBe("Project Update [PJT-A1B2C3D4]");
    expect(call?.headers?.["X-SaaS2-Message-Type"]).toBe("project-kickoff");

    const attachment = call?.attachments?.find((a) => a.filename === "project-document.md");
    expect(attachment?.content).toContain("# PROJECT FILE");
    expect(attachment?.content).toContain("## Instructions to LLM");
    expect(attachment?.content).toContain("## Goals");
    expect(attachment?.content).toContain("## Decisions");
    expect(attachment?.content).toContain("### In Progress");
    expect(attachment?.content).toContain("### Completed");
    expect(attachment?.content).toContain("## Pending Suggestions");

    expect(call?.html).toContain('charset="utf-8"');
    expect(call?.html).toContain('class="email-root"');
    expect(call?.html).toContain("project-document.md");
    expect(call?.html).not.toContain("<strong>Project:</strong>");
    expect(call?.html).not.toContain("<strong>Status:</strong>");
    expect(call?.html).not.toContain("<strong>Last Update:</strong>");
    expect(call?.html).not.toContain("You are working on:");
    expect(call?.text).toBe(
      "Here is your updated project file.\n\nUpload it into your LLM and continue working on your project.\n\nAttachment: project-document.md",
    );
    expect(call?.text).not.toContain("Project:");
    expect(call?.text).not.toContain("Status:");
    expect(call?.text).not.toContain("Last Update:");
    expect(call?.text).not.toContain("You are working on:");
    expect(call?.text).toContain("Attachment: project-document.md");
    expect(call?.text).not.toContain("{{summary}}");
  });

  it("uses fixed subject for update", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Project Update [PJT-A1B2C3D4]");
    expect(call?.html).toContain("Here is your updated project file.");
    expect(call?.text).not.toContain("Project: AI SaaS for real estate");
  });

  it("uses reminder message type when emailKind=reminder", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    payload.emailKind = "reminder";
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Project Update [PJT-A1B2C3D4]");
    expect(call?.headers?.["X-SaaS2-Message-Type"]).toBe("project-reminder");
  });

  it("renders pending suggestions in deterministic markdown section", async () => {
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
    expect(attachment?.content).toContain("## Pending Suggestions");
    expect(attachment?.content).toContain("- [s1] User prefers short answers");
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
    expect(attachment?.content).toContain("## Pending Suggestions");
    expect(attachment?.content).toContain("## Recent Updates");
  });

  it("appends project code to subject when present", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    payload.context.projectCode = "pjt-deadbeef";
    await sendProjectEmail(["user@example.com"], payload);

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Project Update [PJT-DEADBEEF]");
  });

  it("throws when projectCode is missing from payload context", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    delete payload.context.projectCode;
    await expect(sendProjectEmail(["user@example.com"], payload)).rejects.toThrow(
      "Project outbound email requires context.projectCode.",
    );
  });

  it("throws even when project-name metadata exists but projectCode is absent", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(false);
    delete payload.context.projectCode;
    payload.context.projectName = "Meal Planning App for Busy Professionals";
    await expect(sendProjectEmail(["user@example.com"], payload)).rejects.toThrow(
      "Project outbound email requires context.projectCode.",
    );
  });

  it("validates required document headings before attachment send", async () => {
    const { validateProjectDocumentForAttachment } = await import("@/modules/output/sendProjectEmail");
    expect(() => validateProjectDocumentForAttachment("# PROJECT FILE\n\nbroken")).toThrow(
      "Generated project document is missing required section: ## Instructions to LLM",
    );
  });
});
