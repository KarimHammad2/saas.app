import { describe, expect, it } from "vitest";
import { emptyUserProfileContext } from "@/modules/contracts/types";
import { formatProjectEmail, formatProjectEmailForRpm } from "@/modules/output/formatProjectEmail";
import type { ProjectEmailPayload } from "@/modules/output/types";

const basePayload = (): ProjectEmailPayload => ({
  context: {
    projectId: "p1",
    userId: "u1",
    projectCode: "pjt-abc",
    projectName: "Test",
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
  },
  userProfile: emptyUserProfileContext(),
  pendingSuggestions: [],
  nextSteps: [],
  isWelcome: false,
});

describe("formatProjectEmail", () => {
  it("prepends transaction confirmation when recordedTransaction is set", () => {
    const payload = basePayload();
    payload.recordedTransaction = {
      event: {
        hoursPurchased: 20,
        hourlyRate: 50,
        allocatedHours: 18,
        bufferHours: 2,
        saas2Fee: 1,
        projectRemainder: 1,
      },
      remainderBalance: 1,
      paymentTotal: 1000,
      paymentCurrency: "usd",
      paymentLinkUrl: "https://pay.saassquared.com/b/testpay",
      paymentLinkTierAmount: 1000,
    };
    const { body } = formatProjectEmail(payload);
    expect(body).toContain("Transaction recorded");
    expect(body).toContain("Hours Purchased: 20");
    expect(body).toContain("Rate: $50/hour");
    expect(body).toContain("Allocated: 18");
    expect(body).toContain("Buffer: 2");
    expect(body).toContain("Remainder Balance: 1");
    expect(body).not.toContain("Total (hours × rate)");
    expect(body).not.toContain("Pay now:");
    expect(body).not.toContain("https://pay.saassquared.com/b/testpay");
    expect(body).toContain("Here is your updated project file.");
  });

  it("prepends the same block for RPM copy", () => {
    const payload = basePayload();
    payload.recordedTransaction = {
      event: {
        hoursPurchased: 10,
        hourlyRate: 100,
        allocatedHours: 9,
        bufferHours: 1,
        saas2Fee: 0.5,
        projectRemainder: 0.5,
      },
      remainderBalance: 3,
      paymentTotal: 1000,
      paymentCurrency: "usd",
      paymentLinkUrl: "https://pay.saassquared.com/b/rpm",
      paymentLinkTierAmount: 1000,
    };
    const { body } = formatProjectEmailForRpm(payload);
    expect(body).toContain("Transaction recorded");
    expect(body).toContain("Remainder Balance: 3");
    expect(body).toContain("assigned RPM copy");
    expect(body).not.toContain("Pay now:");
  });

  it("uses CA$ in the rate line when payment currency is CAD", () => {
    const payload = basePayload();
    payload.recordedTransaction = {
      event: {
        hoursPurchased: 10,
        hourlyRate: 100,
        allocatedHours: 9,
        bufferHours: 1,
        saas2Fee: 0.5,
        projectRemainder: 0.5,
        rateCurrency: "cad",
      },
      remainderBalance: 2,
      paymentTotal: 1000,
      paymentCurrency: "cad",
      paymentLinkUrl: "https://pay.example/cad",
      paymentLinkTierAmount: 1000,
    };
    const { body } = formatProjectEmail(payload);
    expect(body).toContain("Rate: CA$100/hour");
  });
});
