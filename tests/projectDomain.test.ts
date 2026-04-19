import { describe, expect, it } from "vitest";
import { inferProjectDomainFromText, parseStoredProjectDomain } from "@/modules/domain/projectDomain";

describe("inferProjectDomainFromText", () => {
  it("classifies marketing copy", () => {
    expect(inferProjectDomainFromText(["Launch our Q2 Google Ads campaign for lead gen"])).toBe("marketing");
    expect(inferProjectDomainFromText(["SEO and content marketing for the new product"])).toBe("marketing");
    expect(inferProjectDomainFromText(["We want to launch a new outbound campaign for our agency to get new leads"])).toBe(
      "marketing",
    );
  });

  it("classifies sales copy", () => {
    expect(inferProjectDomainFromText(["Build an outbound sales funnel for SMB"])).toBe("sales");
    expect(inferProjectDomainFromText(["Improve our pipeline conversion and discovery calls"])).toBe("sales");
  });

  it("classifies tech product copy", () => {
    expect(inferProjectDomainFromText(["Ship an MVP SaaS for appointment booking"])).toBe("tech_product");
    expect(inferProjectDomainFromText(["Build a mobile app with auth and API"])).toBe("tech_product");
  });

  it("classifies operations copy", () => {
    expect(inferProjectDomainFromText(["Write SOPs for our hiring and onboarding process"])).toBe("operations");
  });

  it("defaults to general when ambiguous", () => {
    expect(inferProjectDomainFromText(["Grow the business this quarter"])).toBe("general");
    expect(inferProjectDomainFromText([])).toBe("general");
  });
});

describe("parseStoredProjectDomain", () => {
  it("returns undefined for empty or invalid", () => {
    expect(parseStoredProjectDomain(null)).toBeUndefined();
    expect(parseStoredProjectDomain("")).toBeUndefined();
    expect(parseStoredProjectDomain("not-a-domain")).toBeUndefined();
  });

  it("accepts valid stored values", () => {
    expect(parseStoredProjectDomain("marketing")).toBe("marketing");
    expect(parseStoredProjectDomain(" tech_product ")).toBe("tech_product");
  });
});
