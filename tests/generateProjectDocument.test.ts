import { describe, expect, it } from "vitest";
import { emptyUserProfileContext } from "@/modules/contracts/types";
import { generateProjectDocument } from "@/modules/output/generateProjectDocument";
import type { ProjectEmailPayload } from "@/modules/output/types";

function buildPayload(): ProjectEmailPayload {
  return {
    isWelcome: false,
    userProfile: emptyUserProfileContext(),
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
    expect(content).toContain("### Project direction changes (pivot / new focus)");
    expect(content).toContain("Phrasing that is reliably detected");
    expect(content).toContain("### Hiring and Pricing Logic");
    expect(content).toContain("NEVER simulate payment");
    expect(content).toContain("Project Name:");
    expect(content).toContain("## Summary");
    expect(content).toContain("Build a lightweight CRM for agencies.");
    const sectionOrder = [
      "## Project Metadata",
      "## User Profile Context",
      "## Instructions to LLM",
      "## Summary",
      "## Project Overview",
      "## Goals",
      "## Tasks",
      "### In Progress",
      "### Completed",
      "## Risks",
      "## Decisions",
      "## Follow Ups",
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
    payload.context.initialSummary = "";
    payload.context.goals = [];
    payload.context.actionItems = [];
    payload.context.completedTasks = [];
    payload.context.risks = [];
    payload.context.decisions = [];
    payload.context.notes = [];
    payload.context.recentUpdatesLog = [];
    payload.pendingSuggestions = [];

    const content = generateProjectDocument(payload);
    expect(content).toContain("## Summary");
    expect(content).toContain("(No summary yet.)");
    expect(content).toContain("(No overview yet.)");
    expect(content).toContain("## Goals");
    expect(content).toContain("## Tasks");
    expect(content).toContain("### In Progress\n\n(none)");
    expect(content).toContain("### Completed\n\n(none)");
    expect(content).toContain("## Risks");
    expect(content).toContain("## Decisions");
    expect(content).toContain("## Follow Ups");
    expect(content).toContain("## Notes");
    expect(content).toContain("## Recent Updates");
    expect(content).toContain("## Pending Suggestions");
    expect(content.match(/\(none\)/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("renders follow ups with absolute dates and raw when text", () => {
    const payload = buildPayload();
    payload.context.followUps = [
      {
        action: "Follow up with John about API access",
        target: "John",
        whenText: "Tomorrow",
        dueDate: "2026-04-22",
        status: "pending",
      },
      {
        action: "Send project update email",
        target: "Client",
        whenText: "Friday",
        dueDate: "2026-04-25",
        status: "pending",
      },
    ];

    const content = generateProjectDocument(payload);
    expect(content).toContain("## Follow Ups");
    expect(content).toContain("- [2026-04-22] Follow up with John about API access (Target: John, When: Tomorrow)");
    expect(content).toContain("- [2026-04-25] Send project update email (Target: Client, When: Friday)");
    expect(content.indexOf("Follow up with John about API access")).toBeLessThan(
      content.indexOf("Send project update email"),
    );
  });

  it("falls back to initialSummary when the current summary is empty", () => {
    const payload = buildPayload();
    payload.context.summary = "";
    payload.context.initialSummary = "Kickoff summary for the project.";

    const content = generateProjectDocument(payload);
    expect(content).toContain("## Summary");
    expect(content).toContain("Kickoff summary for the project.");
    expect(content).toContain("## Project Overview");
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

  it("shows Assign RPM prompt for agency with oversight when no RPM", () => {
    const payload = buildPayload();
    payload.context.tier = "agency";
    payload.context.planPackage = "agency";
    payload.context.featureFlags = { collaborators: true, oversight: true };
    const content = generateProjectDocument(payload);
    expect(content).toContain("Assign RPM:");
    expect(content).toContain("Put the email of the RPM");
    expect(content).not.toContain("Assigned RPM:");
  });

  it("shows Assigned RPM for agency with oversight when RPM is set", () => {
    const payload = buildPayload();
    payload.context.tier = "agency";
    payload.context.planPackage = "agency";
    payload.context.featureFlags = { collaborators: true, oversight: true };
    payload.context.activeRpmEmail = "rpm@agency.com";
    const content = generateProjectDocument(payload);
    expect(content).toContain("Assigned RPM:");
    expect(content).toContain("- rpm@agency.com");
    expect(content).not.toMatch(/^Assign RPM:/m);
  });

  it("includes Financial Summary and transaction history in project markdown", () => {
    const payload = buildPayload();
    payload.context.remainderBalance = 1.5;
    payload.context.transactionHistory = [
      {
        id: "t1",
        type: "hourPurchase",
        hoursPurchased: 20,
        hourlyRate: 50,
        allocatedHours: 18,
        bufferHours: 2,
        saas2Fee: 1,
        projectRemainder: 1,
        createdAt: "2026-04-01T12:00:00.000Z",
        paymentTotal: 1000,
        paymentCurrency: "usd",
        paymentLinkUrl: null,
        paymentLinkTierAmount: null,
        paidAt: "2026-04-02T12:00:00.000Z",
        paymentStatus: "paid",
      },
      {
        id: "t2",
        type: "hourPurchase",
        hoursPurchased: 10,
        hourlyRate: 100,
        allocatedHours: 9,
        bufferHours: 1,
        saas2Fee: 0.5,
        projectRemainder: 0.5,
        createdAt: "2026-04-10T12:00:00.000Z",
        paymentTotal: 1000,
        paymentCurrency: "usd",
        paymentLinkUrl: null,
        paymentLinkTierAmount: null,
        paidAt: "2026-04-11T12:00:00.000Z",
        paymentStatus: "paid",
      },
    ];
    const content = generateProjectDocument(payload);
    expect(content.indexOf("## Summary")).toBeLessThan(content.indexOf("## Project Overview"));
    expect(content.indexOf("## Project Overview")).toBeLessThan(content.indexOf("## Financial Summary"));
    expect(content.indexOf("## Financial Summary")).toBeLessThan(content.indexOf("## Goals"));
    expect(content).toContain("## Financial Summary");
    expect(content).toContain("Remainder Balance: 1.5 hours");
    expect(content).toContain("### Transaction History");
    expect(content).toContain("- 20 hours at $50/hour → Remainder +1 hour (Paid)");
    expect(content).toContain("- 10 hours at $100/hour → Remainder +0.5 hour (Paid)");
  });

  it("marks pending hour purchases in transaction history", () => {
    const payload = buildPayload();
    payload.context.remainderBalance = 0.5;
    payload.context.transactionHistory = [
      {
        id: "t-pending",
        type: "hourPurchase",
        hoursPurchased: 10,
        hourlyRate: 100,
        allocatedHours: 9,
        bufferHours: 1,
        saas2Fee: 0.5,
        projectRemainder: 0.5,
        createdAt: "2026-04-10T12:00:00.000Z",
        paymentTotal: 1000,
        paymentCurrency: "usd",
        paymentLinkUrl: "https://pay.example/x",
        paymentLinkTierAmount: 1000,
        paidAt: null,
        paymentStatus: "pending_payment",
      },
    ];
    const content = generateProjectDocument(payload);
    expect(content).toContain("→ Remainder +0.5 hour (Pending payment)");
    expect(content).not.toContain("(Paid)");
  });
});
