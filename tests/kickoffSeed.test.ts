import { describe, expect, it } from "vitest";
import { extractKickoffSeed } from "@/modules/domain/kickoffSeed";

describe("extractKickoffSeed", () => {
  it("extracts multiline seed after working-on heading", () => {
    const body = [
      "Hi Frank,",
      "",
      "I want to start a project.",
      "",
      "Here’s what we’re working on:",
      "platform for managing client projects across our team",
    ].join("\n");

    const result = extractKickoffSeed(body);
    expect(result.seed).toBe("platform for managing client projects across our team");
    expect(result.sourcePhrase).toBe("working_on");
    expect(result.sourceParagraph).toContain("platform for managing client projects");
  });

  it("extracts seed from planning phrasing", () => {
    const body = "I'm planning a dashboard for managing onboarding across our agency.";
    const result = extractKickoffSeed(body);
    expect(result.seed).toBe("a dashboard for managing onboarding across our agency");
    expect(result.sourcePhrase).toBe("planning");
    expect(result.sourceParagraph).toBe(body);
  });

  it("returns null when no kickoff anchor exists", () => {
    expect(extractKickoffSeed("Quick update, shipped auth yesterday.")).toEqual({
      seed: null,
      sourcePhrase: null,
      sourceParagraph: null,
    });
  });

  it("picks the pitch paragraph over an earlier context paragraph in a large email", () => {
    const body = [
      "Hi Frank,",
      "",
      "Hope you're doing well! It's been a while since we last spoke at the conference in Lisbon.",
      "I was referred to you by Sarah from Acme Corp, who said you were the person to talk to about",
      "getting new projects off the ground. She mentioned you had helped her a lot last quarter.",
      "",
      "Anyway, I'm building a SaaS platform for restaurants to manage reservations and online orders.",
      "",
      "Let me know what you think when you get a chance.",
      "",
      "Thanks,",
      "Alex",
    ].join("\n");

    const result = extractKickoffSeed(body);
    expect(result.seed).toBe(
      "a SaaS platform for restaurants to manage reservations and online orders",
    );
    expect(result.sourcePhrase).toBe("building");
    expect(result.sourceParagraph).toContain("SaaS platform for restaurants");
    expect(result.sourceParagraph).not.toContain("Hope you're doing well");
  });

  it("ignores closing and signature paragraphs when selecting the seed", () => {
    const body = [
      "Hello Frank,",
      "",
      "We're launching an outbound marketing campaign to enterprise CMOs next quarter.",
      "",
      "Looking forward to hearing from you.",
      "",
      "Best regards,",
      "Sent from my iPhone",
    ].join("\n");

    const result = extractKickoffSeed(body);
    expect(result.seed).toBeTruthy();
    expect(result.sourceParagraph).toContain("outbound marketing campaign");
    expect(result.sourceParagraph).not.toContain("Looking forward");
    expect(result.sourceParagraph).not.toContain("Sent from");
  });

  it("trims clause boundaries after the pitch", () => {
    const body =
      "I want to build a customer portal for agencies because our current tool cannot handle multi-client workflows anymore.";
    const result = extractKickoffSeed(body);
    expect(result.seed).toBe("a customer portal for agencies");
    expect(result.sourcePhrase).toBe("want_to_build");
  });
});
