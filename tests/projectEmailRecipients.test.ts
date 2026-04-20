import { describe, expect, it } from "vitest";
import type { ProjectContext } from "@/modules/contracts/types";
import { buildProjectEmailRecipientList } from "@/modules/domain/projectEmailRecipients";

function baseState(overrides: Partial<ProjectContext>): ProjectContext {
  return {
    projectId: "p1",
    userId: "u1",
    projectStatus: "active",
    summary: "",
    initialSummary: "",
    currentStatus: "",
    goals: [],
    actionItems: [],
    completedTasks: [],
    decisions: [],
    risks: [],
    recommendations: [],
    notes: [],
    participants: [],
    recentUpdatesLog: [],
    remainderBalance: 0,
    reminderBalance: 0,
    usageCount: 0,
    tier: "solopreneur",
    transactionHistory: [],
    ...overrides,
  };
}

describe("buildProjectEmailRecipientList", () => {
  it("dedupes owner, participants, and RPM when RPM is assigned", () => {
    const list = buildProjectEmailRecipientList(
      baseState({
        ownerEmail: "owner@example.com",
        participants: ["collab@example.com"],
        activeRpmEmail: "rpm@example.com",
        featureFlags: { collaborators: true, oversight: true },
      }),
    );
    expect(list.sort()).toEqual(["collab@example.com", "owner@example.com", "rpm@example.com"].sort());
  });

  it("includes RPM even when human oversight flag is off (e.g. freemium) so they get transaction and payment mail", () => {
    const list = buildProjectEmailRecipientList(
      baseState({
        ownerEmail: "owner@example.com",
        activeRpmEmail: "rpm@example.com",
        tier: "freemium",
        featureFlags: { collaborators: false, oversight: false },
      }),
    );
    expect(list.sort()).toEqual(["owner@example.com", "rpm@example.com"].sort());
  });

  it("normalizes and keeps owner first even with mixed casing and spaces", () => {
    const list = buildProjectEmailRecipientList(
      baseState({
        ownerEmail: " Owner@Example.com ",
        participants: ["member@example.com", "owner@example.com"],
        featureFlags: { collaborators: true, oversight: false },
      }),
    );
    expect(list).toEqual(["owner@example.com", "member@example.com"]);
  });

  it("still returns participants when owner email is missing", () => {
    const list = buildProjectEmailRecipientList(
      baseState({
        ownerEmail: undefined,
        participants: ["member@example.com"],
        featureFlags: { collaborators: true, oversight: false },
      }),
    );
    expect(list).toEqual(["member@example.com"]);
  });
});
