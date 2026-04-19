import { describe, expect, it } from "vitest";
import { planAgencyRpmReplacement } from "@/modules/domain/agencyTierRpm";

describe("planAgencyRpmReplacement", () => {
  const master = "daniel@saassquared.com";

  it("returns noop when active RPM is not the master user", () => {
    expect(planAgencyRpmReplacement(master, "other@example.com", null)).toBe("noop");
    expect(planAgencyRpmReplacement(master, null, "agency@example.com")).toBe("noop");
  });

  it("returns assign when active RPM is master and agency default is a different email", () => {
    expect(planAgencyRpmReplacement(master, master, "rpm@agency.com")).toBe("assign");
  });

  it("returns clear when active RPM is master and agency default is unset", () => {
    expect(planAgencyRpmReplacement(master, master, null)).toBe("clear");
    expect(planAgencyRpmReplacement(master, master, undefined)).toBe("clear");
  });

  it("returns clear when agency default equals master (no effective replacement)", () => {
    expect(planAgencyRpmReplacement(master, master, master)).toBe("clear");
  });
});
