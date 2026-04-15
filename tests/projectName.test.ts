import { describe, expect, it } from "vitest";
import { generateShortProjectName } from "@/modules/domain/projectName";

describe("generateShortProjectName", () => {
  it("does not leak contraction fragments into generated names", () => {
    expect(generateShortProjectName("I'm building a client portal for agencies")).toBe("Building Client Portal Agencies");
    expect(generateShortProjectName("We're building a dashboard for clinics")).toBe("Building Dashboard Clinics");
  });
});
