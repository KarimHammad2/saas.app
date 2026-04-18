import { describe, expect, it } from "vitest";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { buildKickoffSummary, getKickoffFollowUpQuestions } from "@/modules/domain/kickoff";
import { stableVariantIndex } from "@/modules/domain/playbookVariant";

function marketingKickoffEvent(): NormalizedEmailEvent {
  return {
    eventId: "e1",
    provider: "resend",
    providerEventId: "m1",
    timestamp: new Date().toISOString(),
    from: "user@example.com",
    fromDisplayName: null,
    to: [],
    cc: [],
    subject: "Ads",
    inReplyTo: null,
    references: [],
    rawBody: "I want to run google ads for my business to get new leads",
    parsed: {
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
    },
  };
}

describe("kickoff A/B variants", () => {
  it("getKickoffFollowUpQuestions differs by variant for marketing", () => {
    const a = getKickoffFollowUpQuestions("marketing", 0);
    const b = getKickoffFollowUpQuestions("marketing", 1);
    expect(a[0]).not.toBe(b[0]);
  });

  it("buildKickoffSummary goals differ when projectId maps to different variants", () => {
    const event = marketingKickoffEvent();
    let id0: string | null = null;
    let id1: string | null = null;
    for (let i = 0; i < 200; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      if (stableVariantIndex(id) === 0 && !id0) {
        id0 = id;
      }
      if (stableVariantIndex(id) === 1 && !id1) {
        id1 = id;
      }
      if (id0 && id1) {
        break;
      }
    }
    expect(id0).not.toBeNull();
    expect(id1).not.toBeNull();
    const g0 = buildKickoffSummary(event, id0!).goals;
    const g1 = buildKickoffSummary(event, id1!).goals;
    expect(g0.join("|")).not.toBe(g1.join("|"));
  });

  it("same projectId always yields the same kickoff goals", () => {
    const event = marketingKickoffEvent();
    const id = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    expect(buildKickoffSummary(event, id).goals).toEqual(buildKickoffSummary(event, id).goals);
  });
});
