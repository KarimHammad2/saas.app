import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { shouldProcessInboundEmail } from "@/modules/email/inboundPolicy";

function baseEvent(overrides: Partial<NormalizedEmailEvent> = {}): NormalizedEmailEvent {
  return {
    eventId: "e1",
    provider: "resend",
    providerEventId: "p1",
    timestamp: new Date().toISOString(),
    from: "user@external.com",
    to: [],
    cc: [],
    subject: "S",
    rawBody: "Summary:\nHi",
    parsed: {
      summary: "Hi",
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
    ...overrides,
  };
}

describe("shouldProcessInboundEmail", () => {
  beforeEach(() => {
    vi.stubEnv("INBOUND_TRIGGER_EMAIL", "frank@policy.test");
    vi.stubEnv("MASTER_USER_EMAIL", "daniel@policy.test");
    vi.stubEnv("INTERNAL_INBOUND_SENDERS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows when Frank is in To with display name form", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["Frank <frank@policy.test>"],
        from: "client@example.com",
      }),
    );
    expect(d).toEqual({ ok: true });
  });

  it("rejects when Frank is only in CC", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["other@example.com"],
        cc: ["frank@policy.test"],
        from: "client@example.com",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "not_addressed_to_frank" });
  });

  it("rejects when To is contact@ without Frank", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["contact@policy.test"],
        from: "client@example.com",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "not_addressed_to_frank" });
  });

  it("rejects when To is daniel@ without Frank", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["daniel@policy.test"],
        from: "client@example.com",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "not_addressed_to_frank" });
  });

  it("rejects internal sender frank", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@policy.test"],
        from: "frank@policy.test",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "internal_sender" });
  });

  it("rejects internal sender daniel", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@policy.test"],
        from: "daniel@policy.test",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "internal_sender" });
  });

  it("rejects internal sender message@ alias", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@policy.test"],
        from: "message@policy.test",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "internal_sender" });
  });

  it("allows external user To Frank", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@policy.test"],
        from: "user@external.com",
      }),
    );
    expect(d).toEqual({ ok: true });
  });

  it("rejects invalid sender", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@policy.test"],
        from: "not-an-email",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "invalid_sender" });
  });
});
