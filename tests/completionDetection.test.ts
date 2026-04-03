import { describe, expect, it } from "vitest";
import { detectCompletedTasks, filterCompletedToKnownTasks } from "@/modules/domain/completionDetection";

describe("filterCompletedToKnownTasks", () => {
  it("keeps only lines that match current action items", () => {
    expect(
      filterCompletedToKnownTasks(["Build auth", "Other"], ["Build authentication", "Ship"]),
    ).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(filterCompletedToKnownTasks(["BUILD AUTH"], ["build auth"])).toEqual(["BUILD AUTH"]);
  });
});

describe("detectCompletedTasks", () => {
  it("returns task when sentence signals completion and shares a word", () => {
    const tasks = ["Build authentication flow"];
    const body = "Hey team — authentication is done for this week.";
    expect(detectCompletedTasks(body, tasks)).toEqual(["Build authentication flow"]);
  });

  it("returns empty when no completion keyword", () => {
    expect(detectCompletedTasks("Still working on authentication.", ["Build authentication flow"])).toEqual([]);
  });

  it("returns empty when no tasks", () => {
    expect(detectCompletedTasks("Done!", [])).toEqual([]);
  });

  it("does not mark task completed when sentence is negated", () => {
    expect(detectCompletedTasks("Authentication is not done yet.", ["Build authentication flow"])).toEqual([]);
  });
});
