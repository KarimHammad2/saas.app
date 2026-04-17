import { describe, expect, it } from "vitest";
import { deepMergeUserProfileContext } from "@/modules/domain/userProfileMerge";

describe("deepMergeUserProfileContext", () => {
  it("deep-merges nested objects without dropping sibling keys", () => {
    const base = {
      communicationStyle: { tone: "formal" },
      constraints: { budget: "medium" },
      sowSignals: { industry: "healthcare" },
    };
    const patch = {
      communicationStyle: { verbosity: "low" },
      constraints: { deadline: "2 weeks" },
    };
    const merged = deepMergeUserProfileContext(base, patch);
    expect(merged.communicationStyle).toEqual({ tone: "formal", verbosity: "low" });
    expect(merged.constraints).toEqual({ budget: "medium", deadline: "2 weeks" });
    expect(merged.sowSignals).toEqual({ industry: "healthcare" });
  });

  it("merges longTermInstructions with dedupe", () => {
    const merged = deepMergeUserProfileContext(
      { longTermInstructions: ["a", "b"] },
      { longTermInstructions: ["b", "c"] },
    );
    expect(merged.longTermInstructions).toEqual(["a", "b", "c"]);
  });

  it("merges sowSignals partials", () => {
    const merged = deepMergeUserProfileContext(
      { sowSignals: { role: "founder", industry: "x" } },
      { sowSignals: { project_stage: "building" } },
    );
    expect(merged.sowSignals).toMatchObject({
      role: "founder",
      industry: "x",
      project_stage: "building",
    });
  });
});
