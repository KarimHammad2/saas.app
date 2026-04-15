import { describe, expect, it } from "vitest";
import type { ProjectContext } from "@/modules/contracts/types";
import { computeProjectProgress } from "@/modules/output/presentationHelpers";

const emptyContext = (): ProjectContext => ({
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
  tier: "freemium",
  transactionHistory: [],
});

describe("computeProjectProgress", () => {
  it("scores 0 when nothing is filled", () => {
    const p = computeProjectProgress(emptyContext());
    expect(p.completeness).toBe(0);
  });

  it("uses 10 when goals exist but no tasks are tracked yet", () => {
    const ctx = emptyContext();
    ctx.goals = ["g"];
    expect(computeProjectProgress(ctx).completeness).toBe(10);
  });

  it("is completed_tasks / action_items when tasks exist", () => {
    const ctx = emptyContext();
    ctx.actionItems = ["a", "b", "c", "d"];
    ctx.completedTasks = ["a", "c"];
    expect(computeProjectProgress(ctx).completeness).toBe(50);
  });

  it("reaches 100 when every action item is completed", () => {
    const ctx = emptyContext();
    ctx.actionItems = ["a", "b"];
    ctx.completedTasks = ["a", "b"];
    expect(computeProjectProgress(ctx).completeness).toBe(100);
  });

  it("ignores completed entries that are not current action items", () => {
    const ctx = emptyContext();
    ctx.actionItems = ["a"];
    ctx.completedTasks = ["a", "orphan"];
    expect(computeProjectProgress(ctx).completeness).toBe(100);
  });
});
