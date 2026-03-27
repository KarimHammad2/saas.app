import { describe, expect, it } from "vitest";
import { combineRuleBasedOverview } from "@/modules/domain/overviewRegeneration";

describe("combineRuleBasedOverview", () => {
  it("combines initial text with goals and recent notes", () => {
    const out = combineRuleBasedOverview({
      initialOverview: "Fitness coaching SaaS.",
      goals: ["Ship MVP", "Onboard 10 coaches"],
      notes: ["old", "Discussed pricing", "Latest sync"],
    });
    expect(out).toContain("Fitness coaching");
    expect(out).toContain("Ship MVP");
    expect(out).toContain("Latest sync");
  });
});
