import { describe, expect, it } from "vitest";
import type { ProjectContext, UserProfileContext } from "@/modules/contracts/types";
import { generateRPMSuggestions } from "@/modules/domain/rpmSuggestions";

const baseProject = (): ProjectContext => ({
  projectId: "p1",
  userId: "u1",
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
  reminderBalance: 3,
  usageCount: 0,
  tier: "freemium",
  transactionHistory: [],
});

const baseProfile = (): UserProfileContext => ({
  communicationStyle: "",
  preferences: {},
  constraints: {},
  onboardingData: "",
  salesCallTranscripts: [],
  longTermInstructions: "",
  behaviorModifiers: {},
  structuredContext: {},
});

describe("generateRPMSuggestions", () => {
  it("returns actionable suggestions for empty project", () => {
    const lines = generateRPMSuggestions(baseProject(), baseProfile());
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => /validate|users/i.test(l))).toBe(true);
    expect(lines.some((l) => /haven.?t defined risks/i.test(l))).toBe(true);
    expect(lines.some((l) => /first 3 tasks/i.test(l))).toBe(true);
  });

  it("suggests milestones when goals exist", () => {
    const p = baseProject();
    p.goals = ["Ship MVP"];
    p.summary = "Something";
    const lines = generateRPMSuggestions(p, baseProfile());
    expect(lines.some((l) => /milestones/i.test(l))).toBe(true);
  });

  it("mentions MVP when goals_style is mvp_first", () => {
    const p = baseProfile();
    p.structuredContext.goals_style = "mvp_first";
    const lines = generateRPMSuggestions(baseProject(), p);
    expect(lines.some((l) => /mvp/i.test(l))).toBe(true);
  });
});
