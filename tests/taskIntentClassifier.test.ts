import { describe, expect, it } from "vitest";
import {
  applyTaskIntents,
  classifyTaskMessage,
  extractTaskHint,
  matchTask,
  normalize,
  type TaskIntent,
} from "@/modules/domain/taskIntentClassifier";

describe("normalize", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalize("Build landing page!")).toBe("build landing page");
  });
});

describe("matchTask", () => {
  it("matches when normalized task contains hint", () => {
    const tasks = ["Build landing page", "Setup authentication"];
    expect(matchTask("landing page", tasks)).toBe("Build landing page");
  });

  it("matches when hint contains normalized task", () => {
    expect(matchTask("Build landing page for marketing", ["landing"])).toBe("landing");
  });

  it("returns null when no overlap", () => {
    expect(matchTask("payments", ["Build landing page"])).toBeNull();
  });
});

describe("classifyTaskMessage", () => {
  const cases: Array<[string, TaskIntent]> = [
    ["Change landing page to include pricing", "UPDATE_TASK"],
    ["Update API integration to use v2", "UPDATE_TASK"],
    ["Working on dashboard today", "START_TASK"],
    ["Started on authentication flow", "START_TASK"],
    ["We should add Stripe payments", "CREATE_TASK"],
    ["Need to implement webhooks", "CREATE_TASK"],
    ["Add user roles", "CREATE_TASK"],
    ["Landing page is done", "COMPLETE_TASK"],
    ["Authentication has been finished", "COMPLETE_TASK"],
    ["Just checking in with the team today", "UNKNOWN"],
  ];

  it.each(cases)("classifies %j as %s", (sentence, expected) => {
    expect(classifyTaskMessage(sentence)).toBe(expected);
  });
});

describe("extractTaskHint", () => {
  it("extracts hint for UPDATE_TASK", () => {
    expect(extractTaskHint("Change landing page to include pricing section", "UPDATE_TASK")).toBe("landing page");
  });

  it("extracts hint for START_TASK", () => {
    expect(extractTaskHint("Working on dashboard", "START_TASK")).toBe("dashboard");
  });

  it("extracts hint for CREATE_TASK", () => {
    expect(extractTaskHint("We should add Stripe payments", "CREATE_TASK")).toBe("Stripe payments");
  });

  it("extracts hint for COMPLETE_TASK", () => {
    expect(extractTaskHint("Landing page is done", "COMPLETE_TASK").toLowerCase()).toContain("landing page");
  });
});

describe("applyTaskIntents", () => {
  it("skips COMPLETE_TASK sentences (orchestration uses detectCompletedTasks)", () => {
    const events = applyTaskIntents("Landing page is done.", []);
    expect(events).toEqual([]);
  });

  it("emits UPDATE_TASK with appended detail when matched", () => {
    const tasks = ["Build landing page"];
    const events = applyTaskIntents("Change landing page to include pricing section.", tasks);
    expect(events).toHaveLength(1);
    expect(events[0].intent).toBe("UPDATE_TASK");
    expect(events[0].matchedTask).toBe("Build landing page");
    expect(events[0].updatedText).toBe("Build landing page (include pricing section)");
  });

  it("emits CREATE_TASK when no existing task matches", () => {
    const events = applyTaskIntents("We should add Stripe payments.", []);
    expect(events).toHaveLength(1);
    expect(events[0].intent).toBe("CREATE_TASK");
    expect(events[0].matchedTask).toBeNull();
    expect(events[0].taskHint).toBe("Stripe payments");
  });

  it("does not emit CREATE_TASK duplicate when hint matches existing task", () => {
    const tasks = ["Stripe payments"];
    const events = applyTaskIntents("We should add Stripe payments.", tasks);
    expect(events).toHaveLength(1);
    expect(events[0].intent).toBe("CREATE_TASK");
    expect(events[0].matchedTask).toBe("Stripe payments");
  });

  it("emits START_TASK with optional match", () => {
    const tasks = ["Create dashboard"];
    const events = applyTaskIntents("Working on dashboard.", tasks);
    expect(events).toHaveLength(1);
    expect(events[0].intent).toBe("START_TASK");
    expect(events[0].matchedTask).toBe("Create dashboard");
  });

  it("emits UNKNOWN for substantive unmatched sentences", () => {
    const events = applyTaskIntents(
      "The quarterly review needs more stakeholder input before we proceed.",
      [],
    );
    expect(events.some((e) => e.intent === "UNKNOWN")).toBe(true);
  });

  it("does not emit UNKNOWN for very short sentences", () => {
    const events = applyTaskIntents("Hi there.", []);
    expect(events.filter((e) => e.intent === "UNKNOWN")).toHaveLength(0);
  });

  it("does not emit UNKNOWN for bullet fragments", () => {
    const events = applyTaskIntents("- Build landing page", []);
    expect(events.filter((e) => e.intent === "UNKNOWN")).toHaveLength(0);
  });
});
