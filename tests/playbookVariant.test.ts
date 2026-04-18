import { describe, expect, it } from "vitest";
import { stableVariantIndex } from "@/modules/domain/playbookVariant";

describe("stableVariantIndex", () => {
  it("returns the same index for the same seed", () => {
    expect(stableVariantIndex("pjt-abc123")).toBe(stableVariantIndex("pjt-abc123"));
  });

  it("returns only 0 or 1 for default modulo", () => {
    for (let i = 0; i < 50; i++) {
      const v = stableVariantIndex(`id-${i}`);
      expect(v === 0 || v === 1).toBe(true);
    }
  });
});
