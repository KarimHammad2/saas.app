import { describe, expect, it } from "vitest";
import { parseEmailToStructuredData } from "@/src/orchestration/parser";

describe("parseEmailToStructuredData", () => {
  it("extracts explicit sections and bullets", () => {
    const result = parseEmailToStructuredData(`
Goals:
- Launch MVP

Tasks:
- Finalize API

Risks:
- Timeline risk

Notes:
- Follow up with legal

Decisions:
- Use Supabase
`);

    expect(result.goals).toEqual(["Launch MVP"]);
    expect(result.tasks).toEqual(["Finalize API"]);
    expect(result.risks).toEqual(["Timeline risk"]);
    expect(result.notes).toEqual(["Follow up with legal"]);
    expect(result.decisions).toEqual(["Use Supabase"]);
  });

  it("falls back to notes for unstructured content", () => {
    const result = parseEmailToStructuredData("We aligned scope and will update next week.");
    expect(result.notes).toEqual(["We aligned scope and will update next week."]);
    expect(result.tasks).toEqual([]);
  });
});
