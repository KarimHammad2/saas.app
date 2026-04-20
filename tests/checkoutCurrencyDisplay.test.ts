import { describe, expect, it } from "vitest";
import { formatHourlyRateForEmail, formatMoneyAmountForEmail } from "@/modules/output/checkoutCurrencyDisplay";
import { formatPaymentInstructionsBody } from "@/modules/output/paymentOutbound";

describe("checkoutCurrencyDisplay", () => {
  it("formats USD and CAD labels", () => {
    expect(formatMoneyAmountForEmail(1000, "usd")).toBe("$1000");
    expect(formatMoneyAmountForEmail(1000, "cad")).toBe("CA$1000");
    expect(formatHourlyRateForEmail(50, "usd")).toBe("$50/hour");
    expect(formatHourlyRateForEmail(50, "cad")).toBe("CA$50/hour");
  });
});

describe("formatPaymentInstructionsBody", () => {
  it("uses CA$ in the total line for CAD checkout", () => {
    const body = formatPaymentInstructionsBody({
      paymentTotal: 500,
      paymentCurrency: "cad",
      paymentLinkUrl: "https://pay.example/c",
      paymentLinkTierAmount: 500,
    });
    expect(body).toContain("Your purchase total is CA$500");
  });
});
