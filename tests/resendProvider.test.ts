import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/resend", () => ({
  getResendClient: vi.fn(),
}));

import { getResendClient } from "@/lib/resend";
import { resendProvider } from "@/modules/email/providers/resendProvider";

describe("resendProvider.parseInbound", () => {
  it("hydrates missing body content from Resend receiving API", async () => {
    const mockedGetResendClient = vi.mocked(getResendClient);
    mockedGetResendClient.mockReturnValue({
      emails: {
        receiving: {
          get: vi.fn().mockResolvedValue({
            data: {
              id: "email_1",
              from: "Karim <karim@example.com>",
              subject: "[Project: Real Life Test] Kickoff",
              text: "Summary:\nHydrated body\n\nGoals:\n- Continue flow",
              to: ["frank@example.com"],
              cc: [],
              message_id: "<msg_1>",
            },
            error: null,
          }),
        },
      },
    } as unknown as ReturnType<typeof getResendClient>);

    const event = await resendProvider.parseInbound({
      headers: {},
      payload: {
        type: "email.received",
        data: {
          email_id: "email_1",
          from: "Karim <karim@example.com>",
          subject: "[Project: Real Life Test] Kickoff",
          to: ["frank@example.com"],
          cc: [],
        },
      },
    });

    expect(event.from).toBe("karim@example.com");
    expect(event.parsed.summary).toBe("Hydrated body");
    expect(event.parsed.goals).toEqual(["Continue flow"]);
  });
});
