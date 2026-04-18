import { describe, expect, it } from "vitest";
import type { ProjectContext, UserProfileContext } from "@/modules/contracts/types";
import { emptyUserProfileContext } from "@/modules/contracts/types";
import { stableVariantIndex } from "@/modules/domain/playbookVariant";
import { generateRPMSuggestions } from "@/modules/domain/rpmSuggestions";

const baseProject = (): ProjectContext => ({
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
  reminderBalance: 3,
  usageCount: 0,
  tier: "freemium",
  transactionHistory: [],
});

const baseProfile = (): UserProfileContext => emptyUserProfileContext();

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

  it("uses marketing-flavored suggestions when copy implies marketing", () => {
    const p = baseProject();
    p.summary = "Launch a Google Ads campaign for our spring promotion";
    const lines = generateRPMSuggestions(p, baseProfile());
    expect(lines.some((l) => /campaign|channel|creative|ICP/i.test(l))).toBe(true);
    expect(lines.some((l) => /target users before building more scope/i.test(l))).toBe(false);
  });

  it("RPM marketing copy differs by projectId variant", () => {
    const mk = (projectId: string) => {
      const p = baseProject();
      p.projectId = projectId;
      p.projectDomain = "marketing";
      p.summary = "campaign";
      return generateRPMSuggestions(p, baseProfile()).join("\n");
    };
    let id0: string | null = null;
    let id1: string | null = null;
    for (let i = 0; i < 200; i++) {
      const id = `rpm-variant-${i}`;
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
    expect(mk(id0!)).not.toBe(mk(id1!));
  });
});
