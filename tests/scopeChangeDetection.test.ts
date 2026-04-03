import { describe, expect, it } from "vitest";
import { detectProjectScopeChange, extractScopeTransition } from "@/modules/domain/scopeChangeDetection";

describe("scopeChangeDetection", () => {
  it.each([
    "We are no longer building a mobile app.",
    "Instead, we want a shared spreadsheet workflow for gyms.",
    "We are switching to a concierge service model.",
    "We are changing direction from B2C to B2B.",
    "This is a pivot toward enterprise onboarding.",
    "That is too expensive, now we want a simpler offer.",
    "Rather than an app, we want a spreadsheet process.",
  ])("detects scope change phrase: %s", (message) => {
    expect(detectProjectScopeChange(message)).toBe(true);
  });

  it("extracts from/to transition for clear pivot sentence", () => {
    const transition = extractScopeTransition(
      "We are no longer building a mobile app, instead we want a shared spreadsheet workflow for gyms.",
    );
    expect(transition).toEqual({
      fromScope: "a mobile app",
      toScope: "a shared spreadsheet workflow for gyms",
    });
  });

  it("extracts transition when new direction is in a second sentence ending with instead", () => {
    const transition = extractScopeTransition(
      "We are no longer building a mobile app. We want a shared spreadsheet workflow for gyms instead.",
    );
    expect(transition).toEqual({
      fromScope: "a mobile app",
      toScope: "a shared spreadsheet workflow for gyms",
    });
  });
});
