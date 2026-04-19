import { describe, expect, it } from "vitest";
import {
  applyApprovedInboundRpmSuggestionToContext,
  parseSuggestionIntoStructuredContext,
} from "@/modules/domain/rpmApprovedProfileContext";

describe("applyApprovedInboundRpmSuggestionToContext", () => {
  it("replaces longTermInstructions instead of appending to prior entries", () => {
    const base = {
      longTermInstructions: ["old block a", "old block b"],
      communicationStyle: { tone: "formal" },
    };
    const next = applyApprovedInboundRpmSuggestionToContext(base, "New RPM approved text only.");
    expect(next.longTermInstructions).toEqual(["New RPM approved text only."]);
    expect(next.communicationStyle).toEqual({ tone: "formal" });
  });

  it("replaces sowSignals from suggestion text only, dropping prior structured fields", () => {
    const base = {
      longTermInstructions: ["prior"],
      sowSignals: {
        role: "old role",
        industry: "old industry",
      },
    };
    const text = "I'm a product manager building a CRM. Prefers short answers.";
    const next = applyApprovedInboundRpmSuggestionToContext(base, text);
    expect(next.longTermInstructions).toEqual([text]);
    const sow = next.sowSignals as Record<string, unknown>;
    expect(sow.industry).toBeUndefined();
    expect(sow.role).toBe("product manager");
    expect(sow.business).toBe("crm");
    expect(Array.isArray(sow.preferencesList)).toBe(true);
  });

  it("returns base unchanged when suggestion is empty or whitespace", () => {
    const base = { longTermInstructions: ["x"], sowSignals: { role: "y" } };
    expect(applyApprovedInboundRpmSuggestionToContext(base, "")).toBe(base);
    expect(applyApprovedInboundRpmSuggestionToContext(base, "   ")).toBe(base);
  });
});

describe("parseSuggestionIntoStructuredContext", () => {
  it("extracts role and business patterns", () => {
    const p = parseSuggestionIntoStructuredContext("I'm a solo founder building a SaaS.");
    expect(p.role).toBe("solo founder");
    expect(p.business?.toLowerCase()).toBe("saas");
  });
});
