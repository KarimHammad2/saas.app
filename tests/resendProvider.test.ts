import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/lib/resend", () => ({
  getResendClient: vi.fn(),
}));

import { getResendClient } from "@/lib/resend";
import { resendProvider } from "@/modules/email/providers/resendProvider";

function signSvixPayload(payload: string, id: string, timestamp: string, secret: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${payload}`;
  const digest = createHmac("sha256", key).update(signedContent).digest("base64");
  return `v1,${digest}`;
}

describe("resendProvider.validateSignature", () => {
  it("throws for missing webhook secret configuration", () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    expect(() =>
      resendProvider.validateSignature({
        headers: {
          "svix-id": "msg_123",
          "svix-timestamp": String(Math.floor(Date.now() / 1000)),
          "svix-signature": "v1,invalid",
        },
        payload: { hello: "world" },
        rawBody: JSON.stringify({ hello: "world" }),
      }),
    ).toThrow("Missing required environment variable: RESEND_WEBHOOK_SECRET");
  });

  it("returns true for valid svix signature", () => {
    const secret = `whsec_${Buffer.from("test_secret").toString("base64")}`;
    process.env.RESEND_WEBHOOK_SECRET = secret;

    const rawBody = JSON.stringify({ hello: "world" });
    const svixId = "msg_123";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const svixSignature = signSvixPayload(rawBody, svixId, svixTimestamp, secret);

    const isValid = resendProvider.validateSignature({
      headers: {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      },
      payload: { hello: "world" },
      rawBody,
    });

    expect(isValid).toBe(true);
  });

  it("returns false for invalid svix signature", () => {
    const secret = `whsec_${Buffer.from("test_secret").toString("base64")}`;
    process.env.RESEND_WEBHOOK_SECRET = secret;

    const rawBody = JSON.stringify({ hello: "world" });
    const isValid = resendProvider.validateSignature({
      headers: {
        "svix-id": "msg_123",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,invalid",
      },
      payload: { hello: "world" },
      rawBody,
    });

    expect(isValid).toBe(false);
  });
});

describe("resendProvider.parseInbound", () => {
  it("hydrates missing body content from Resend receiving API", async () => {
    const mockedGetResendClient = vi.mocked(getResendClient);
    const getReceivedEmail = vi.fn(function (this: { resend?: unknown }, emailId: string) {
      if (!this?.resend) {
        throw new Error("missing resend context");
      }
      expect(emailId).toBe("email_1");
      return Promise.resolve({
        data: {
          id: "email_1",
          from: "Karim <karim@example.com>",
          subject: "[Project: Real Life Test] Kickoff",
          text: "Summary:\nHydrated body\n\nGoals:\n- Continue flow",
          to: ["frank@example.com"],
          cc: [],
          attachments: [{ filename: "scope.pdf", content_type: "application/pdf" }],
          message_id: "<msg_1>",
        },
        error: null,
      });
    });

    mockedGetResendClient.mockReturnValue({
      emails: {
        receiving: {
          resend: { ok: true },
          get: getReceivedEmail,
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
    expect(event.parsed.summary).toBeNull();
    expect(event.parsed.goals).toEqual(["Continue flow"]);
    expect(event.attachments).toEqual([{ filename: "scope.pdf", contentType: "application/pdf", isPdf: true }]);
    expect(getReceivedEmail).toHaveBeenCalledOnce();
  });
});

describe("resendProvider.sendEmail", () => {
  it("passes attachment content as UTF-8 Buffer", async () => {
    const send = vi.fn().mockResolvedValue({ error: null });
    const mockedGetResendClient = vi.mocked(getResendClient);
    mockedGetResendClient.mockReturnValue({
      emails: { send },
    } as unknown as ReturnType<typeof getResendClient>);

    await resendProvider.sendEmail({
      to: ["user@example.com"],
      subject: "Test",
      text: "Body",
      attachments: [{ filename: "doc.md", content: "café résumé" }],
    });

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]?.[0] as { attachments?: Array<{ content: Buffer }> };
    const attachmentContent = payload?.attachments?.[0]?.content;
    expect(attachmentContent).toBeInstanceOf(Buffer);
    expect(attachmentContent?.toString("utf-8")).toBe("café résumé");
  });
});
