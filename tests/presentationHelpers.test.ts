import { describe, expect, it } from "vitest";
import type { ProjectContext } from "@/modules/contracts/types";
import { computeProjectProgress } from "@/modules/output/presentationHelpers";

const emptyContext = (): ProjectContext => ({
  projectId: "p1",
  userId: "u1",
  summary: "",
  initialSummary: "",
  currentStatus: "",
  goals: [],
  actionItems: [],
  decisions: [],
  risks: [],
  recommendations: [],
  notes: [],
  remainderBalance: 0,
  reminderBalance: 0,
  usageCount: 0,
  tier: "freemium",
  transactionHistory: [],
});

describe("computeProjectProgress", () => {
  it("scores 0 when nothing is filled and usageCount is low", () => {
    const p = computeProjectProgress(emptyContext());
    expect(p.completeness).toBe(0);
  });

  it("sums weighted parts and caps at 100", () => {
    const ctx = emptyContext();
    ctx.goals = ["g"];
    ctx.actionItems = ["t"];
    ctx.risks = ["r"];
    ctx.notes = ["n"];
    ctx.usageCount = 3;
    expect(computeProjectProgress(ctx).completeness).toBe(100);
  });

  it("adds 20 when usageCount is greater than 2", () => {
    const ctx = emptyContext();
    ctx.goals = ["g"];
    ctx.usageCount = 3;
    expect(computeProjectProgress(ctx).completeness).toBe(45);
  });
});
