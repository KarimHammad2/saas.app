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
      goals: ["lead generation", "automation"],
      actionItems: ["launch landing page"],
      decisions: [],
      risks: ["timeline slippage"],
      recommendations: [],
      notes: ["User wants lead gen + automation."],
      remainderBalance: 0,
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
      projectWelcomeTemplate: {
        subject: "Welcome Subject",
        textBody: "Welcome!",
        htmlBody: "<p>Welcome</p>",
      },
    });
  });

  it("uses welcome template when isWelcome=true", async () => {
    const { sendProjectEmail } = await import("@/modules/output/sendProjectEmail");
    const payload = buildPayload(true);
    await sendProjectEmail(["user@example.com"], payload);

    expect(mockedSendEmail).toHaveBeenCalledOnce();
    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Welcome Subject");

    const attachment = call?.attachments?.find((a) => a.filename === "project-document.md");
    expect(attachment?.content).toContain("# Project Update");
    expect(attachment?.content).toContain("## Notes");
    expect(attachment?.content).toContain("- User wants lead gen + automation.");

    expect(call?.html).toContain('charset="utf-8"');
    expect(call?.html).toContain('class="email-root"');
    expect(call?.html).toContain("project-document.md");
    expect(call?.html).not.toContain("<pre>");
    expect(call?.text).toContain("Full project document: see attachment project-document.md");
    expect(call?.text).toContain("Use attached document.");
    expect(call?.text).not.toContain("# Project Update");
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
    expect(call?.text).not.toContain("## Goals");
  });
});

