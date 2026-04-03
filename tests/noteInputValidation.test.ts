import { describe, expect, it } from "vitest";
import { isIgnoredNoteInput } from "@/modules/email/noteInputValidation";

describe("isIgnoredNoteInput", () => {
  it("ignores greeting-only messages", () => {
    expect(isIgnoredNoteInput("hello")).toBe(true);
    expect(isIgnoredNoteInput("Hey Frank")).toBe(true);
  });

  it("ignores short acknowledgement messages", () => {
    expect(isIgnoredNoteInput("thanks")).toBe(true);
    expect(isIgnoredNoteInput("sounds good")).toBe(true);
  });

  it("keeps meaningful unstructured updates", () => {
    expect(isIgnoredNoteInput("Shipped auth and started billing integration this morning.")).toBe(false);
  });
});
