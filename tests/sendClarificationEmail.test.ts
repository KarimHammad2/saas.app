import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/email/sendEmail", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getDefaultFromEmail: vi.fn(() => "Frank <frank@example.com>"),
}));

import { sendEmail } from "@/modules/email/sendEmail";
import { sendCcMembershipConfirmationEmail } from "@/modules/orchestration/sendClarificationEmail";

const mockedSendEmail = vi.mocked(sendEmail);

describe("sendCcMembershipConfirmationEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("includes Agency upgrade and member-addition wording in text and html", async () => {
    await sendCcMembershipConfirmationEmail({
      recipientEmail: "owner@example.com",
      originalSubject: "Project kickoff",
      candidateEmails: ["john@agency.com"],
    });

    expect(mockedSendEmail).toHaveBeenCalledOnce();
    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.to).toBe("owner@example.com");
    expect(call?.subject).toBe("Re: Project kickoff");
    expect(call?.headers?.From).toBe("Frank <frank@example.com>");
    expect(call?.text).toContain("If you reply Yes, we'll upgrade your account to the Agency plan and add the CC email(s) as member(s).");
    expect(call?.text).toContain("If you reply No, your plan and members will stay the same.");
    expect(call?.text).toContain('"Yes"');
    expect(call?.text).toContain('"No"');
    expect(call?.text).toContain("Detected CC emails:");
    expect(call?.text).toContain("- john@agency.com");
    expect(call?.html).toContain("upgrade your account to the <strong>Agency plan</strong>");
    expect(call?.html).toContain("add the CC email(s) as member(s)");
    expect(call?.html).toContain("&quot;Yes&quot;");
    expect(call?.html).toContain("&quot;No&quot;");
    expect(call?.html).toContain("<li>john@agency.com</li>");
  });

  it("keeps existing reply subject when it is already a reply", async () => {
    await sendCcMembershipConfirmationEmail({
      recipientEmail: "owner@example.com",
      originalSubject: "Re: Existing Thread",
      candidateEmails: ["john@agency.com", "jane@agency.com"],
    });

    const call = mockedSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toBe("Re: Existing Thread");
    expect(call?.text).toContain("john@agency.com, jane@agency.com");
    expect(call?.html).toContain("<strong>john@agency.com</strong>, <strong>jane@agency.com</strong>");
  });
});
