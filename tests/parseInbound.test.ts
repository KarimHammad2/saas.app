import { describe, expect, it } from "vitest";
import { InboundParseError, parseInbound } from "@/modules/email/parseInbound";

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

  it("parses resend email.received payload shape", () => {
    const payload = {
      id: "evt_123",
      created_at: "2026-03-18T21:43:30.200Z",
      data: {
        from: {
          email: "karim@example.com",
          name: "Karim",
        },
        to: [{ email: "frank@sign-unlimit.com" }],
        cc: [],
        subject: "[Project: Prod] real email",
        text: "Summary:\nReal inbound\n\nGoals:\n- Confirm resend payload support",
        email_id: "a8e65746-13a5-49b1-9768-ca4ff213a3d3",
      },
      type: "email.received",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.provider).toBe("resend");
    expect(parsed.providerEventId).toBe("evt_123");
    expect(parsed.from).toBe("karim@example.com");
    expect(parsed.to).toEqual(["frank@sign-unlimit.com"]);
    expect(parsed.parsed.summary).toContain("Real inbound");
    expect(parsed.parsed.goals).toEqual(["Confirm resend payload support"]);
  });

  it("falls back to raw message field when text/html are missing", () => {
    const payload = {
      id: "evt_raw_1",
      data: {
        from: "Karim <karim@example.com>",
        subject: "[Project: Real Life Test] Kickoff",
        message: "Summary:\nRaw payload body\n\nGoals:\n- Parse from message field",
      },
      type: "email.received",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.from).toBe("karim@example.com");
    expect(parsed.parsed.summary).toBe("Raw payload body");
    expect(parsed.parsed.goals).toEqual(["Parse from message field"]);
  });

  it("throws when no supported body content fields are present", () => {
    const payload = {
      from: "karim@example.com",
      subject: "No body",
    };

    expect(() => parseInbound(payload, "resend")).toThrowError(new InboundParseError("Inbound payload is missing email body content."));
  });

  it("parses provider body and sender aliases", () => {
    const payload = {
      id: "evt_alias",
      FromFull: { Email: "alias.sender@example.com" },
      TextBody: "Summary:\nAlias body support\n\nGoals:\n- Parse TextBody and FromFull",
      subject: "Alias test",
    };

    const parsed = parseInbound(payload, "ses");
    expect(parsed.from).toBe("alias.sender@example.com");
    expect(parsed.parsed.summary).toBe("Alias body support");
    expect(parsed.parsed.goals).toEqual(["Parse TextBody and FromFull"]);
  });

  it("normalizes recipient variants from strings and objects", () => {
    const payload = {
      from: "owner@example.com",
      to: "a@example.com, b@example.com",
      cc: [{ email: "c@example.com" }, { address: "d@example.com" }],
      text: "Summary:\nRecipient normalization",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.to).toEqual(["a@example.com", "b@example.com"]);
    expect(parsed.cc).toEqual(["c@example.com", "d@example.com"]);
  });
});
