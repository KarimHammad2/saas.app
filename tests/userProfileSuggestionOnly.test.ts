import { describe, expect, it } from "vitest";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { EMPTY_PROJECT_SECTION_PRESENCE } from "@/modules/contracts/types";
import { isUserProfileSuggestionOnlyInbound } from "@/modules/domain/userProfileSuggestionOnly";

function baseParsed(overrides: Partial<NormalizedEmailEvent["parsed"]> = {}): NormalizedEmailEvent["parsed"] {
  return {
    projectSectionPresence: EMPTY_PROJECT_SECTION_PRESENCE,
    summary: null,
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
    ...overrides,
  };
}

describe("isUserProfileSuggestionOnlyInbound", () => {
  it("returns true for rpm role with only UserProfile Suggestion content", () => {
    const event: NormalizedEmailEvent = {
      eventId: "e",
      provider: "resend",
      providerEventId: "m",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "S",
      inReplyTo: null,
      references: [],
      rawBody: "UserProfile Suggestion:\nPrefer weekly updates.",
      parsed: baseParsed({
        rpmSuggestion: {
          content: "Prefer weekly updates.",
          from: "",
          timestamp: new Date().toISOString(),
        },
      }),
    };
    expect(isUserProfileSuggestionOnlyInbound(event, "rpm")).toBe(true);
  });

  it("returns true for master role with only UserProfile Suggestion", () => {
    const event: NormalizedEmailEvent = {
      eventId: "e",
      provider: "resend",
      providerEventId: "m",
      timestamp: new Date().toISOString(),
      from: "daniel@saassquared.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "S",
      inReplyTo: null,
      references: [],
      rawBody: "UserProfile Suggestion:\nShort summaries.",
      parsed: baseParsed({
        rpmSuggestion: {
          content: "Short summaries.",
          from: "",
          timestamp: new Date().toISOString(),
        },
      }),
    };
    expect(isUserProfileSuggestionOnlyInbound(event, "master")).toBe(true);
  });

  it("returns false when Goals are also present", () => {
    const event: NormalizedEmailEvent = {
      eventId: "e",
      provider: "resend",
      providerEventId: "m",
      timestamp: new Date().toISOString(),
      from: "rpm@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "S",
      inReplyTo: null,
      references: [],
      rawBody: "Goals:\n- X\n\nUserProfile Suggestion:\nY",
      parsed: baseParsed({
        goals: ["X"],
        rpmSuggestion: {
          content: "Y",
          from: "",
          timestamp: new Date().toISOString(),
        },
      }),
    };
    expect(isUserProfileSuggestionOnlyInbound(event, "rpm")).toBe(false);
  });

  it("returns false for owner user role even with only UserProfile Suggestion", () => {
    const event: NormalizedEmailEvent = {
      eventId: "e",
      provider: "resend",
      providerEventId: "m",
      timestamp: new Date().toISOString(),
      from: "owner@example.com",
      fromDisplayName: null,
      to: [],
      cc: [],
      subject: "S",
      inReplyTo: null,
      references: [],
      rawBody: "UserProfile Suggestion:\nZ",
      parsed: baseParsed({
        rpmSuggestion: {
          content: "Z",
          from: "",
          timestamp: new Date().toISOString(),
        },
      }),
    };
    expect(isUserProfileSuggestionOnlyInbound(event, "user")).toBe(false);
  });
});
