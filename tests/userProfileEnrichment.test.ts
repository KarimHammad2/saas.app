import { describe, expect, it } from "vitest";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { enrichUserProfileFromEmailSignals, extractProfileSignals } from "@/modules/domain/userProfileEnrichment";

function baseEvent(rawBody: string): NormalizedEmailEvent {
  return {
    eventId: "e1",
    provider: "resend",
    providerEventId: "m1",
    timestamp: new Date().toISOString(),
    from: "u@example.com",
    fromDisplayName: null,
    to: [],
    cc: [],
    subject: "S",
    inReplyTo: null,
    references: [],
    rawBody,
    parsed: {
      summary: null,
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
}

describe("userProfileEnrichment", () => {
  it("extracts solo founder signal", () => {
    const s = extractProfileSignals("I'm a solo founder building a SaaS.");
    expect(s.role).toBe("solo founder");
    expect(s.business).toBe("SaaS");
    expect(s.business_type).toBe("solo_founder");
  });

  it("merges structured context across emails", () => {
    const first = enrichUserProfileFromEmailSignals({}, baseEvent("solo founder indie project"));
    expect(first.business_type).toBe("solo_founder");
    const second = enrichUserProfileFromEmailSignals(first, baseEvent("We sell B2B to enterprises and prefer short answers."));
    expect(second.preferences?.market).toBe("B2B");
    expect(second.preferencesList).toEqual(["short answers"]);
  });
});
