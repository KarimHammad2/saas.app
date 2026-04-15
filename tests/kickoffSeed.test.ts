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

    expect(extractKickoffSeed(body)).toEqual({
      seed: "platform for managing client projects across our team",
      sourcePhrase: "working_on",
    });
  });

  it("extracts seed from planning phrasing", () => {
    const body = "I'm planning a dashboard for managing onboarding across our agency.";
    expect(extractKickoffSeed(body)).toEqual({
      seed: "a dashboard for managing onboarding across our agency",
      sourcePhrase: "planning",
    });
  });

  it("returns null when no kickoff anchor exists", () => {
    expect(extractKickoffSeed("Quick update, shipped auth yesterday.")).toEqual({
      seed: null,
      sourcePhrase: null,
    });
  });
});
