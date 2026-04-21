import { describe, expect, it } from "vitest";
import { generateShortProjectName } from "@/modules/domain/projectName";

describe("generateShortProjectName", () => {
  it("does not leak contraction fragments into generated names", () => {
    expect(generateShortProjectName("I'm building a client portal for agencies")).toBe("Building Client Portal Agencies");
    expect(generateShortProjectName("We're building a dashboard for clinics")).toBe("Building Dashboard Clinics");
  });

  it("ignores greeting and generic marketing framing", () => {
    expect(generateShortProjectName("Hi Frank, This is a marketing project")).toBe("New Project");
    expect(
      generateShortProjectName("Project goal: Book qualified intro calls with potential clients"),
    ).toBe("Book Qualified Intro Calls");
  });

  it("drops verb particles like 'out' and weak adjectives from generated names", () => {
    expect(
      generateShortProjectName("I want to build out a new client portal for our small agency"),
    ).toBe("Client Portal Agency");
    expect(
      generateShortProjectName("We'd like to launch up a simple quick marketing campaign"),
    ).toBe("Marketing Campaign");
  });

  it("keeps topic-rich names short and readable for large seed inputs", () => {
    expect(
      generateShortProjectName(
        "a platform for restaurants to manage reservations and online orders",
      ),
    ).toBe("Platform Restaurants Manage Reservations");
  });
});
