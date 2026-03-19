import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/lib/resend", () => ({
  getResendClient: vi.fn(),
}));

import { getResendClient } from "@/lib/resend";
import { resendProvider } from "@/modules/email/providers/resendProvider";

function signSvixPayload(payload: string, id: string, timestamp: string, secret: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${timestamp}.${id}.${payload}`;
  const digest = createHmac("sha256", key).update(signedContent).digest("base64");
  return `v1,${digest}`;
}

describe("resendProvider.validateSignature", () => {
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
    expect(event.parsed.summary).toBe("Hydrated body");
    expect(event.parsed.goals).toEqual(["Continue flow"]);
    expect(getReceivedEmail).toHaveBeenCalledOnce();
  });
});
