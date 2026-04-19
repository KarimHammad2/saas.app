import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { EMPTY_PROJECT_SECTION_PRESENCE } from "@/modules/contracts/types";
import { shouldProcessInboundEmail } from "@/modules/email/inboundPolicy";

function baseEvent(overrides: Partial<NormalizedEmailEvent> = {}): NormalizedEmailEvent {
  return {
    eventId: "e1",
    provider: "resend",
    providerEventId: "p1",
    timestamp: new Date().toISOString(),
    from: "user@external.com",
    fromDisplayName: null,
    to: [],
    cc: [],
    subject: "S",
    inReplyTo: null,
    references: [],
    rawBody: "Summary:\nHi",
    parsed: {
      projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
      summary: "Hi",
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
    ...overrides,
  };
}

describe("shouldProcessInboundEmail", () => {
  beforeEach(() => {
    vi.stubEnv("MASTER_USER_EMAIL", "daniel@saassquared.com");
    vi.stubEnv("INTERNAL_INBOUND_SENDERS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows when Frank is in To with display name form", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["Frank <frank@saas2.app>"],
        from: "client@example.com",
      }),
    );
    expect(d).toEqual({ ok: true });
  });

  it("rejects when Frank is only in CC", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["other@example.com"],
        cc: ["frank@saas2.app"],
        from: "client@example.com",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "not_addressed_to_frank" });
  });

  it("rejects when To is contact@ without Frank", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["contact@saas2.app"],
        from: "client@example.com",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "not_addressed_to_frank" });
  });

  it("rejects when To is daniel@ without Frank", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["daniel@saassquared.com"],
        from: "client@example.com",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "not_addressed_to_frank" });
  });

  it("rejects internal sender frank", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@saas2.app"],
        from: "frank@saas2.app",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "internal_sender" });
  });

  it("allows master email when To includes Frank (default RPM replies to Frank)", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@saas2.app"],
        from: "daniel@saassquared.com",
      }),
    );
    expect(d).toEqual({ ok: true });
  });

  it("rejects internal sender message@ alias", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@saas2.app"],
        from: "message@saas2.app",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "internal_sender" });
  });

  it("allows external user To Frank", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@saas2.app"],
        from: "user@external.com",
      }),
    );
    expect(d).toEqual({ ok: true });
  });

  it("rejects invalid sender", () => {
    const d = shouldProcessInboundEmail(
      baseEvent({
        to: ["frank@saas2.app"],
        from: "not-an-email",
      }),
    );
    expect(d).toEqual({ ok: false, reason: "invalid_sender" });
  });
});
