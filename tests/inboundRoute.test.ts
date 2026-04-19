import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboundParseError } from "@/modules/email/parseInbound";
import { EMPTY_PROJECT_SECTION_PRESENCE } from "@/modules/contracts/types";
import type { EmailProvider } from "@/modules/email/providers/types";
import { POST } from "@/app/api/inbound/route";
import { getEmailProvider } from "@/modules/email/providers";

vi.mock("@/modules/email/providers", () => ({
  getEmailProvider: vi.fn(),
}));

const enqueueInboundEmailJob = vi.fn();
const recordOutboundEmailEvent = vi.fn();
vi.mock("@/modules/memory/repository", () => ({
  MemoryRepository: class {
    enqueueInboundEmailJob = enqueueInboundEmailJob;
    recordOutboundEmailEvent = recordOutboundEmailEvent;
  },
}));

vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedGetEmailProvider = vi.mocked(getEmailProvider);

function buildProvider(overrides: Partial<EmailProvider> = {}): EmailProvider {
  const baseEvent = {
    eventId: "evt_1",
    provider: "resend",
    providerEventId: "provider_evt_1",
    timestamp: new Date().toISOString(),
    from: "user@example.com",
    fromDisplayName: null,
    to: ["frank@saas2.app"],
    cc: [],
    subject: "Hello",
    inReplyTo: null,
    references: [],
    rawBody: "Summary:\nHello",
    parsed: {
      projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
      summary: "Hello",
      currentStatus: null,
      goals: [],
      actionItems: [],
      completedTasks: [],
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
    vi.stubEnv("MASTER_USER_EMAIL", "daniel@saassquared.com");
    enqueueInboundEmailJob.mockResolvedValue(true);
    recordOutboundEmailEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    expect(json.queued).toBe(true);
    expect(json.skipped).toBe(false);
    expect(json.duplicate).toBe(false);
    expect(json.emailId).toBe("provider_evt_1");
    expect(json.requestId).toBeTypeOf("string");
    expect(response.headers.get("x-request-id")).toBe(json.requestId);
    expect(enqueueInboundEmailJob).toHaveBeenCalledWith("provider_evt_1", "resend", expect.any(Object));
  });

  it("returns fast queued acknowledgement for plain-text kickoff emails", async () => {
    const plainTextEvent = {
      eventId: "evt_plain_1",
      provider: "resend",
      providerEventId: "provider_evt_plain_1",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: ["frank@saas2.app"],
      cc: [],
      subject: "new",
      inReplyTo: null,
      references: [],
      rawBody: "Hi, I want to build a SaaS for restaurants.",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
        summary: "Hi, I want to build a SaaS for restaurants.",
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
        decisions: [],
        risks: [],
        recommendations: [],
        notes: ["Hi, I want to build a SaaS for restaurants."],
        userProfileContext: null,
        rpmSuggestion: null,
        transactionEvent: null,
        approvals: [],
        additionalEmails: [],
      },
    };
    mockedGetEmailProvider.mockReturnValue(
      buildProvider({
        parseInbound: vi.fn(() => plainTextEvent),
      }),
    );

    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: "user@example.com", text: "Hi, I want to build a SaaS for restaurants." }),
    });

    const response = await POST(request);
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.queued).toBe(true);
    expect(json.skipped).toBe(false);
    expect(json.duplicate).toBe(false);
  });

  it("returns 200 ignored and does not orchestrate when Frank is not in To", async () => {
    const ignoredEvent = {
      eventId: "evt_1",
      provider: "resend",
      providerEventId: "provider_evt_1",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: ["daniel@saassquared.com"],
      cc: [],
      subject: "Hello",
      inReplyTo: null,
      references: [],
      rawBody: "Summary:\nHello",
      parsed: {
        projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
        summary: "Hello",
        currentStatus: null,
        goals: [],
        actionItems: [],
        completedTasks: [],
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
    mockedGetEmailProvider.mockReturnValue(
      buildProvider({
        parseInbound: vi.fn(() => ignoredEvent),
      }),
    );

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
    expect(json.ignored).toBe(true);
    expect(json.reason).toBe("not_addressed_to_frank");
    expect(enqueueInboundEmailJob).not.toHaveBeenCalled();
  });

  it("returns 200 ignored for provider bounced/failed events and records audit", async () => {
    mockedGetEmailProvider.mockReturnValue(buildProvider());
    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "email.bounced",
        id: "evt_bounce_1",
        data: { email_id: "outbound_123" },
      }),
    });

    const response = await POST(request);
    const json = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.ignored).toBe(true);
    expect(json.reason).toBe("provider_delivery_failure_event");
    expect(enqueueInboundEmailJob).not.toHaveBeenCalled();
    expect(recordOutboundEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "provider-delivery-event",
        status: "failed",
        messageId: "evt_bounce_1",
      }),
    );
  });

  it("returns duplicate=true when idempotency detects replay", async () => {
    mockedGetEmailProvider.mockReturnValue(buildProvider());
    enqueueInboundEmailJob.mockResolvedValue(false);

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
    expect(json.queued).toBe(false);
    expect(json.skipped).toBe(true);
    expect(json.duplicate).toBe(true);
  });

  it("returns queued on first webhook and skipped on replay", async () => {
    mockedGetEmailProvider.mockReturnValue(buildProvider());
    enqueueInboundEmailJob.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const firstRequest = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "user@example.com", text: "Summary:\nHi" }),
    });
    const secondRequest = new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "user@example.com", text: "Summary:\nHi" }),
    });

    const firstResponse = await POST(firstRequest);
    const secondResponse = await POST(secondRequest);
    const firstJson = (await firstResponse.json()) as Record<string, unknown>;
    const secondJson = (await secondResponse.json()) as Record<string, unknown>;

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstJson).toMatchObject({ ok: true, queued: true, skipped: false, duplicate: false });
    expect(secondJson).toMatchObject({ ok: true, queued: false, skipped: true, duplicate: true });
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
    const signatureCalls = validateSignature.mock.calls as unknown as Array<[{ rawBody: string }]>;
    expect(signatureCalls[0]?.[0].rawBody).toBe('{"from":"user@example.com","text":"Summary:\\nHi"}');
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

  it("returns 500 when enqueue fails", async () => {
    mockedGetEmailProvider.mockReturnValue(buildProvider());
    enqueueInboundEmailJob.mockRejectedValue(new Error("database unavailable"));

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
