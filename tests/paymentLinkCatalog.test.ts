import { describe, expect, it } from "vitest";
import { resolveUsdPaymentLinkForTotal, USD_PAYMENT_LINK_CATALOG } from "@/modules/domain/paymentLinkCatalog";

describe("resolveUsdPaymentLinkForTotal", () => {
  it("uses exact tier when total matches a catalog amount", () => {
    const r = resolveUsdPaymentLinkForTotal(1000);
    expect(r.tierAmount).toBe(1000);
    expect(r.url).toContain("7sY8wQ1JKf6A6fUdbAgEg0V");
    expect(r.currency).toBe("usd");
  });

  it("floors to largest tier below total when between tiers", () => {
    const r = resolveUsdPaymentLinkForTotal(1234);
    expect(r.tierAmount).toBe(1000);
  });

  it("uses max tier when total exceeds catalog max", () => {
    const r = resolveUsdPaymentLinkForTotal(999_999);
    const max = USD_PAYMENT_LINK_CATALOG[USD_PAYMENT_LINK_CATALOG.length - 1];
    expect(r.tierAmount).toBe(max.amount);
    expect(r.url).toBe(max.url);
  });

  it("uses smallest tier when total is below minimum (fallback)", () => {
    const r = resolveUsdPaymentLinkForTotal(25);
    expect(r.tierAmount).toBe(50);
    expect(r.url).toContain("00w5kE2NOe2wfQu3B0gEg14");
  });

  it("treats negative total as zero then falls back to smallest tier", () => {
    const r = resolveUsdPaymentLinkForTotal(-10);
    expect(r.tierAmount).toBe(50);
  });

  it("floors at boundary just above a tier", () => {
    expect(resolveUsdPaymentLinkForTotal(1001).tierAmount).toBe(1000);
    expect(resolveUsdPaymentLinkForTotal(1000).tierAmount).toBe(1000);
  });
});
