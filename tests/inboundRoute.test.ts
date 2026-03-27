import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboundParseError } from "@/modules/email/parseInbound";
import type { EmailProvider } from "@/modules/email/providers/types";
import { POST } from "@/app/api/inbound/route";
import { getEmailProvider } from "@/modules/email/providers";
import { handleInboundEmailEvent } from "@/src/orchestration/emailHandler";

vi.mock("@/modules/email/providers", () => ({
  getEmailProvider: vi.fn(),
}));

vi.mock("@/src/orchestration/emailHandler", () => ({
  handleInboundEmailEvent: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedGetEmailProvider = vi.mocked(getEmailProvider);
const mockedHandleInboundEmailEvent = vi.mocked(handleInboundEmailEvent);

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
      currentStatus: null,
      goals: [],
      actionItems: [],
      decisions: [],
      risks: [],
      recommendations: [],
      notes: [],
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
    mockedHandleInboundEmailEvent.mockResolvedValue({
      userId: "user_1",
      projectId: "project_1",
      duplicate: false,
    });
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
    expect(json.duplicate).toBe(false);
    expect(json.requestId).toBeTypeOf("string");
    expect(response.headers.get("x-request-id")).toBe(json.requestId);
    expect(mockedHandleInboundEmailEvent).toHaveBeenCalledOnce();
  });

  it("returns duplicate=true when idempotency detects replay", async () => {
    mockedGetEmailProvider.mockReturnValue(buildProvider());
    mockedHandleInboundEmailEvent.mockResolvedValue({
      userId: "user_1",
      projectId: "project_1",
      duplicate: true,
    });

    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: "user@example.com", text: "Summary:\nHi" }),
    });

    const response = await POST(request);
    const json = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(json.duplicate).toBe(true);
  });

  it("returns 401 when signature validation fails", async () => {
    const validateSignature = vi.fn(() => false);
    mockedGetEmailProvider.mockReturnValue(
      buildProvider({
        validateSignature,
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
    expect(validateSignature).toHaveBeenCalledOnce();
    const envelope = validateSignature.mock.calls[0]?.[0];
    expect(envelope.rawBody).toBe('{"from":"user@example.com","text":"Summary:\\nHi"}');
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
    mockedHandleInboundEmailEvent.mockRejectedValue(new Error("database unavailable"));

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

  it("returns explicit configuration error when provider is misconfigured", async () => {
    mockedGetEmailProvider.mockReturnValue(
      buildProvider({
        validateSignature: vi.fn(() => {
          throw new Error("Missing required environment variable: RESEND_WEBHOOK_SECRET");
        }),
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

    expect(response.status).toBe(500);
    expect(json).toMatchObject({
      ok: false,
      code: "CONFIGURATION_ERROR",
      error: "Inbound webhook is misconfigured on the server.",
      retryable: false,
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
