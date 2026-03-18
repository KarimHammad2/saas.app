import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboundParseError } from "@/modules/email/parseInbound";
import type { EmailProvider } from "@/modules/email/providers/types";
import { POST } from "@/app/api/inbound/route";
import { getEmailProvider } from "@/modules/email/providers";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";

vi.mock("@/modules/email/providers", () => ({
  getEmailProvider: vi.fn(),
}));

vi.mock("@/modules/orchestration/processInboundEmail", () => ({
  processInboundEmail: vi.fn(),
}));

vi.mock("@/modules/output/sendProjectEmail", () => ({
  sendProjectEmail: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedGetEmailProvider = vi.mocked(getEmailProvider);
const mockedProcessInboundEmail = vi.mocked(processInboundEmail);
const mockedSendProjectEmail = vi.mocked(sendProjectEmail);

function buildProvider(overrides: Partial<EmailProvider> = {}): EmailProvider {
  const baseEvent = {
    eventId: "evt_1",
    provider: "resend",
    providerEventId: "provider_evt_1",
    timestamp: new Date().toISOString(),
    from: "user@example.com",
    to: [],
    cc: [],
    subject: "Hello",
    rawBody: "Summary:\nHello",
    parsed: {
      summary: "Hello",
      goals: [],
      actionItems: [],
      decisions: [],
      risks: [],
      recommendations: [],
      userProfileContext: null,
      rpmSuggestion: null,
      transactionEvent: null,
      approvals: [],
      additionalEmails: [],
    },
  };

  const provider: EmailProvider = {
    name: "resend",
    validateSignature: vi.fn(() => true),
    parseInbound: vi.fn(() => baseEvent),
    sendEmail: vi.fn(),
  };

  return {
    ...provider,
    ...overrides,
  };
}

describe("POST /api/inbound", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedProcessInboundEmail.mockResolvedValue({
      recipients: ["user@example.com"],
      payload: { subject: "State Update", text: "Hello", html: "<p>Hello</p>" },
      context: {
        userId: "user_1",
        projectId: "project_1",
        eventId: "event_1",
        duplicate: false,
      },
    });
    mockedSendProjectEmail.mockResolvedValue();
  });

  it("returns 200 for valid inbound webhook", async () => {
    mockedGetEmailProvider.mockReturnValue(buildProvider());

    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_123",
        data: { from: "user@example.com", text: "Summary:\nHi" },
      }),
    });

    const response = await POST(request);
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.requestId).toBeTypeOf("string");
    expect(response.headers.get("x-request-id")).toBe(json.requestId);
    expect(mockedProcessInboundEmail).toHaveBeenCalledOnce();
    expect(mockedSendProjectEmail).toHaveBeenCalledOnce();
  });

  it("returns 401 when signature validation fails", async () => {
    mockedGetEmailProvider.mockReturnValue(
      buildProvider({
        validateSignature: vi.fn(() => false),
      }),
    );

    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: "user@example.com", text: "Summary:\nHi" }),
    });

    const response = await POST(request);
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(json).toMatchObject({
      ok: false,
      code: "INVALID_SIGNATURE",
      retryable: false,
    });
  });

  it("returns 400 when payload parsing fails", async () => {
    mockedGetEmailProvider.mockReturnValue(buildProvider());

    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{ not valid json",
    });

    const response = await POST(request);
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      ok: false,
      code: "INVALID_PAYLOAD",
      retryable: false,
    });
  });

  it("returns 400 for unsupported content type", async () => {
    mockedGetEmailProvider.mockReturnValue(buildProvider());

    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: "raw",
    });

    const response = await POST(request);
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      ok: false,
      code: "INVALID_PAYLOAD",
      retryable: false,
    });
  });

  it("returns 500 when downstream processing fails", async () => {
    mockedGetEmailProvider.mockReturnValue(buildProvider());
    mockedProcessInboundEmail.mockRejectedValue(new Error("database unavailable"));

    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: "user@example.com", text: "Summary:\nHi" }),
    });

    const response = await POST(request);
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(json).toMatchObject({
      ok: false,
      code: "PROCESSING_FAILED",
      error: "Internal server error.",
      retryable: true,
    });
  });

  it("reads multipart file content before provider parsing", async () => {
    const provider = buildProvider({
      parseInbound: vi.fn(() => {
        throw new InboundParseError("Expected parse failure");
      }),
    });
    mockedGetEmailProvider.mockReturnValue(provider);

    const formData = new FormData();
    formData.set("from", "user@example.com");
    formData.set("message", new File(["Summary:\nRead file body"], "inbound.txt", { type: "text/plain" }));

    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const parseInboundMock = vi.mocked(provider.parseInbound);
    const envelope = parseInboundMock.mock.calls[0]?.[0];
    const payload = envelope?.payload as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(payload.message).toBe("Summary:\nRead file body");
  });
});
