import { beforeEach, describe, expect, it, vi } from "vitest";
import { NonRetryableInboundError } from "@/modules/orchestration/errors";

const claimNextInboundEmailJob = vi.fn();
const markInboundEmailProcessed = vi.fn();
const rescheduleInboundEmailJob = vi.fn();
const markInboundEmailFailed = vi.fn();
const markFallbackEmailSent = vi.fn();
const handleInboundEmailEvent = vi.fn();
const sendProcessingFallbackEmail = vi.fn();

vi.mock("@/modules/memory/repository", () => ({
  MemoryRepository: class {
    claimNextInboundEmailJob = claimNextInboundEmailJob;
    markInboundEmailProcessed = markInboundEmailProcessed;
    rescheduleInboundEmailJob = rescheduleInboundEmailJob;
    markInboundEmailFailed = markInboundEmailFailed;
    markFallbackEmailSent = markFallbackEmailSent;
  },
}));

vi.mock("@/modules/orchestration/handleInboundEmail", () => ({
  handleInboundEmailEvent,
}));

vi.mock("@/modules/orchestration/sendProcessingFallbackEmail", () => ({
  sendProcessingFallbackEmail,
}));

vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job_1",
    emailId: "email_1",
    provider: "resend",
    attempts: 1,
    payload: {
      eventId: "evt_1",
      provider: "resend",
      providerEventId: "provider_evt_1",
      timestamp: new Date().toISOString(),
      from: "user@example.com",
      fromDisplayName: null,
      to: ["frank@inbound.test"],
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
    },
    ...overrides,
  };
}

describe("POST /api/cron/inbound", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CRON_SECRET", "secret-test");
    claimNextInboundEmailJob.mockResolvedValue(null);
  });

  it("returns 401 without valid bearer token", async () => {
    const { POST } = await import("@/app/api/cron/inbound/route");
    const res = await POST(new Request("http://localhost/api/cron/inbound"));
    expect(res.status).toBe(401);
  });

  it("processes claimed jobs and marks them as processed", async () => {
    claimNextInboundEmailJob.mockResolvedValueOnce(buildJob()).mockResolvedValueOnce(null);
    handleInboundEmailEvent.mockResolvedValue({ duplicate: false });

    const { POST } = await import("@/app/api/cron/inbound/route");
    const res = await POST(
      new Request("http://localhost/api/cron/inbound", {
        method: "POST",
        headers: { authorization: "Bearer secret-test" },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; retried: number; failed: number };
    expect(body).toMatchObject({ processed: 1, retried: 0, failed: 0 });
    expect(markInboundEmailProcessed).toHaveBeenCalledWith("job_1", "email_1");
  });

  it("reschedules retryable failures before max attempts", async () => {
    claimNextInboundEmailJob.mockResolvedValueOnce(buildJob({ attempts: 1 })).mockResolvedValueOnce(null);
    handleInboundEmailEvent.mockRejectedValue(new Error("temporary outage"));

    const { POST } = await import("@/app/api/cron/inbound/route");
    const res = await POST(
      new Request("http://localhost/api/cron/inbound", {
        method: "POST",
        headers: { authorization: "Bearer secret-test" },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; retried: number; failed: number };
    expect(body).toMatchObject({ processed: 0, retried: 1, failed: 0 });
    expect(rescheduleInboundEmailJob).toHaveBeenCalledOnce();
    expect(markInboundEmailFailed).not.toHaveBeenCalled();
    expect(sendProcessingFallbackEmail).not.toHaveBeenCalled();
  });

  it("marks terminal failures and sends fallback once", async () => {
    claimNextInboundEmailJob.mockResolvedValueOnce(buildJob({ attempts: 3 })).mockResolvedValueOnce(null);
    handleInboundEmailEvent.mockRejectedValue(new Error("permanent failure"));
    markFallbackEmailSent.mockResolvedValue(true);

    const { POST } = await import("@/app/api/cron/inbound/route");
    const res = await POST(
      new Request("http://localhost/api/cron/inbound", {
        method: "POST",
        headers: { authorization: "Bearer secret-test" },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { failed: number };
    expect(body.failed).toBe(1);
    expect(markInboundEmailFailed).toHaveBeenCalledWith("job_1", "email_1", "permanent failure");
    expect(markFallbackEmailSent).toHaveBeenCalledWith("email_1");
    expect(sendProcessingFallbackEmail).toHaveBeenCalledOnce();
  });

  it("handles non-retryable errors as terminal failures", async () => {
    claimNextInboundEmailJob.mockResolvedValueOnce(buildJob({ attempts: 1 })).mockResolvedValueOnce(null);
    handleInboundEmailEvent.mockRejectedValue(
      new NonRetryableInboundError("bad payload", {
        code: "INVALID_QUEUED_PAYLOAD",
        status: 422,
      }),
    );
    markFallbackEmailSent.mockResolvedValue(false);

    const { POST } = await import("@/app/api/cron/inbound/route");
    const res = await POST(
      new Request("http://localhost/api/cron/inbound", {
        method: "POST",
        headers: { authorization: "Bearer secret-test" },
      }),
    );

    expect(res.status).toBe(200);
    expect(rescheduleInboundEmailJob).not.toHaveBeenCalled();
    expect(markInboundEmailFailed).toHaveBeenCalledWith("job_1", "email_1", "bad payload");
    expect(sendProcessingFallbackEmail).not.toHaveBeenCalled();
  });
});
