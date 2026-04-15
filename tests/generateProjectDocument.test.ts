import { describe, expect, it } from "vitest";
import { generateProjectDocument } from "@/modules/output/generateProjectDocument";
import type { ProjectEmailPayload } from "@/modules/output/types";

function buildPayload(): ProjectEmailPayload {
  return {
    isWelcome: false,
    context: {
      projectId: "p1",
      userId: "u1",
      projectCode: "pjt-a1b2c3d4",
      projectStatus: "active",
      summary: "Build a lightweight CRM for agencies.",
      initialSummary: "Build a lightweight CRM for agencies.",
      currentStatus: "",
      goals: ["Ship MVP"],
      actionItems: ["Implement auth"],
      completedTasks: ["Set up repo"],
      decisions: ["Start with web only"],
      risks: ["Timeline slip"],
      recommendations: [],
      notes: ["Need stakeholder review next week."],
      participants: [],
      recentUpdatesLog: ["[2026-04-03] Scope refined for MVP"],
      remainderBalance: 0,
      reminderBalance: 3,
      usageCount: 0,
      tier: "freemium",
      transactionHistory: [],
    },
    pendingSuggestions: [
      {
        id: "s1",
        userId: "u1",
        projectId: "p1",
        fromEmail: "rpm@example.com",
        content: "User prefers concise answers",
        status: "pending",
        createdAt: new Date().toISOString(),
        source: "inbound",
      },
    ],
    nextSteps: [],
  };
}

describe("generateProjectDocument", () => {
  it("keeps stable LLM-ready section ordering", () => {
    const content = generateProjectDocument(buildPayload());
    expect(content).toContain("## Instructions to LLM");
    expect(content).toContain("Your role:");
    expect(content).toContain(" - Help the user think through this project");
    expect(content).toContain("Scope rules:");
    expect(content).toContain("Project Status:\n- Active");
    expect(content).toContain("Always format updates using the exact project update structure in this document");
    expect(content).toContain("Only include sections that changed");
    expect(content).toContain("End important working sessions by giving the user a ready-to-send update for Frank");
    const sectionOrder = [
      "## Instructions to LLM",
      "## Project Overview",
      "## Goals",
      "## Tasks",
      "### In Progress",
      "### Completed",
      "## Risks",
      "## Decisions",
      "## Notes",
      "## Recent Updates",
      "## Pending Suggestions",
    ];
    let lastIndex = -1;
    for (const heading of sectionOrder) {
      const idx = content.indexOf(heading);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
    expect(content.indexOf("## Decisions")).toBeLessThan(content.lastIndexOf("Project Status:\n- Active"));
    expect(content.lastIndexOf("Project Status:\n- Active")).toBeLessThan(content.indexOf("## Notes"));
  });

  it("renders deterministic empty states for all major sections", () => {
    const payload = buildPayload();
    payload.context.summary = "";
    payload.context.goals = [];
    payload.context.actionItems = [];
    payload.context.completedTasks = [];
    payload.context.risks = [];
    payload.context.decisions = [];
    payload.context.notes = [];
    payload.context.recentUpdatesLog = [];
    payload.pendingSuggestions = [];

    const content = generateProjectDocument(payload);
    expect(content).toContain("(No overview yet.)");
    expect(content).toContain("## Goals");
    expect(content).toContain("## Tasks");
    expect(content).toContain("### In Progress\n\n(none)");
    expect(content).toContain("### Completed\n\n(none)");
    expect(content).toContain("## Risks");
    expect(content).toContain("## Decisions");
    expect(content).toContain("## Notes");
    expect(content).toContain("## Recent Updates");
    expect(content).toContain("## Pending Suggestions");
    expect(content.match(/\(none\)/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("deduplicates pending suggestions deterministically", () => {
    const payload = buildPayload();
    payload.pendingSuggestions = [
      {
        id: "s1",
        userId: "u1",
        projectId: "p1",
        fromEmail: "rpm@example.com",
        content: "User prefers concise answers",
        status: "pending",
        createdAt: new Date().toISOString(),
        source: "inbound",
      },
      {
        id: "s1",
        userId: "u1",
        projectId: "p1",
        fromEmail: "rpm@example.com",
        content: "User prefers concise answers",
        status: "pending",
        createdAt: new Date().toISOString(),
        source: "inbound",
      },
    ];

    const content = generateProjectDocument(payload);
    expect(content.match(/\- \[s1\] User prefers concise answers/g)?.length ?? 0).toBe(1);
  });
});
