import { describe, expect, it } from "vitest";
import { prepareInboundPlainText } from "@/modules/email/parseInbound";
import { stripEmailSignature } from "@/modules/email/stripEmailSignature";

describe("stripEmailSignature", () => {
  it("removes Best, and lines below when tail looks like a signature", () => {
    const input = [
      "Here is the real message.",
      "",
      "Best,",
      "Daniel Sanderson",
      "SaaS² and Frank Lee Founder",
    ].join("\n");
    expect(stripEmailSignature(input)).toBe("Here is the real message.");
  });

  it("removes Best regards block", () => {
    const input = "Quick update on the file.\n\nBest regards,\nJane\nAcme Inc.";
    expect(stripEmailSignature(input)).toBe("Quick update on the file.");
  });

  it("does not strip when Thanks is followed by a long paragraph", () => {
    const longPara = "x".repeat(200);
    const input = `Intro line.\n\nThanks\n\n${longPara}`;
    expect(stripEmailSignature(input)).toBe(input.trimEnd());
  });

  it("does not treat mid-sentence thank you as a closing", () => {
    const input = "Thank you for the detailed feedback; we will proceed.";
    expect(stripEmailSignature(input)).toBe(input);
  });

  it("strips Sent from my iPhone footer when it is the anchor at end", () => {
    const input = "Please review the draft.\n\nSent from my iPhone";
    expect(stripEmailSignature(input)).toBe("Please review the draft.");
  });

  it("returns empty when body is only a closing and name lines", () => {
    const input = "Best,\nPat";
    expect(stripEmailSignature(input)).toBe("");
  });

  it("does not strip conversational single-line bodies (no signature)", () => {
    const text = "Hey so yeah basically I'm thinking maybe something like a SaaS for restaurants idk...";
    expect(stripEmailSignature(text)).toBe(text);
  });

});

describe("prepareInboundPlainText", () => {
  it("applies stripQuotedReply then stripEmailSignature then normalization", () => {
    const input = [
      "Summary: project update",
      "",
      "Kind regards,",
      "Alex",
      "--",
      "On Mon, someone wrote:",
      "old quoted",
    ].join("\n");
    const out = prepareInboundPlainText(input);
    expect(out).toContain("Summary: project update");
    expect(out).not.toContain("Kind regards");
    expect(out).not.toContain("old quoted");
  });
});
