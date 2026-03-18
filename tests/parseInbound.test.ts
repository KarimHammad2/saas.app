import { describe, expect, it } from "vitest";
import { parseInbound } from "@/modules/email/parseInbound";

describe("parseInbound", () => {
  it("extracts labeled sections and transaction fields", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "[Project: Revamp] Update",
      text: `
Summary:
Refined project scope.

Goals:
- Launch MVP

Action Items:
- Draft architecture

Decisions:
- Use Supabase

Risks:
- Timeline slippage

Recommendations:
- Weekly check-in

UserProfile:
Prefer concise updates.

UserProfile Suggestion:
Send weekly updates on Mondays.

Transaction:
Hours Purchased: 20
Hourly Rate: 50
Allocated to Freelancer: 18
Buffer: 2
SaaS2 Fee: 1
Project Remainder: 1

Approve suggestion abc-123
`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.from).toBe("user@example.com");
    expect(parsed.parsed.summary).toContain("Refined project scope");
    expect(parsed.parsed.goals).toEqual(["Launch MVP"]);
    expect(parsed.parsed.actionItems).toEqual(["Draft architecture"]);
    expect(parsed.parsed.decisions).toEqual(["Use Supabase"]);
    expect(parsed.parsed.risks).toEqual(["Timeline slippage"]);
    expect(parsed.parsed.recommendations).toEqual(["Weekly check-in"]);
    expect(parsed.parsed.userProfileContext).toContain("Prefer concise");
    expect(parsed.parsed.rpmSuggestion?.content).toContain("weekly updates");
    expect(parsed.parsed.transactionEvent?.hoursPurchased).toBe(20);
    expect(parsed.parsed.approvals[0]).toEqual({ suggestionId: "abc-123" });
  });
});
