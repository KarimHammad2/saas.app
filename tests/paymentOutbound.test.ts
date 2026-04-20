import { describe, expect, it } from "vitest";
import type { ProjectContext, TransactionPaymentMeta, TransactionRecord } from "@/modules/contracts/types";
import {
  formatPaymentConfirmedPlainText,
  formatPaymentInstructionsBody,
} from "@/modules/output/paymentOutbound";

const baseContext = (): ProjectContext => ({
  projectId: "p1",
  userId: "u1",
  projectCode: "pjt-a1b2c3d4",
  projectName: "Demo",
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
  remainderBalance: 12,
  reminderBalance: 0,
  usageCount: 0,
  tier: "solopreneur",
  transactionHistory: [],
});

describe("payment outbound copy", () => {
  it("formats payment instructions with total and link", () => {
    const payment: TransactionPaymentMeta = {
      paymentTotal: 500,
      paymentCurrency: "usd",
      paymentLinkUrl: "https://pay.example/checkout",
      paymentLinkTierAmount: 500,
    };
    const body = formatPaymentInstructionsBody(payment);
    expect(body).toContain("Your purchase total is $500 (hours × rate).");
    expect(body).toContain("Pay here: https://pay.example/checkout");
    expect(body).toContain("Paid");
  });

  it("formats payment confirmed summary from project context and paid row", () => {
    const paid: TransactionRecord = {
      id: "t1",
      type: "hourPurchase",
      hoursPurchased: 5,
      hourlyRate: 100,
      allocatedHours: 4.5,
      bufferHours: 0.5,
      saas2Fee: 50,
      projectRemainder: 0,
      createdAt: new Date().toISOString(),
      paymentTotal: 500,
      paymentCurrency: "usd",
      paymentLinkUrl: null,
      paymentLinkTierAmount: null,
      paidAt: new Date().toISOString(),
    };
    const text = formatPaymentConfirmedPlainText(baseContext(), paid);
    expect(text).toContain("Payment confirmed.");
    expect(text).toContain("Hours Purchased: 5");
    expect(text).toContain("Remainder Balance: 12");
    expect(text).toContain("Demo");
  });
});
