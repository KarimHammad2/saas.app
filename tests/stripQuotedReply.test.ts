import { describe, expect, it } from "vitest";
import { stripQuotedReply } from "@/modules/email/stripQuotedReply";

describe("stripQuotedReply", () => {
  it("keeps first paragraph and drops quoted lines", () => {
    const input = "Here is my update.\n\nOn Mon Jan 1, someone wrote:\n> old thread\n> more";
    expect(stripQuotedReply(input).trim()).toBe("Here is my update.");
  });

  it("stops at -----Original Message-----", () => {
    const input = "New reply only.\n-----Original Message-----\nFrom: x@y.com";
    expect(stripQuotedReply(input).trim()).toBe("New reply only.");
  });
});
