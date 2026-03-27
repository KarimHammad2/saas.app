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
    expect(parsed.fromDisplayName).toBe("User");
    expect(parsed.parsed.summary).toContain("Refined project scope");
    expect(parsed.parsed.goals).toEqual(["Launch MVP"]);
    expect(parsed.parsed.actionItems).toEqual(["Draft architecture"]);
    expect(parsed.parsed.decisions).toEqual(["Use Supabase"]);
    expect(parsed.parsed.risks).toEqual(["Timeline slippage"]);
    expect(parsed.parsed.recommendations).toEqual(["Weekly check-in"]);
    expect(parsed.parsed.currentStatus).toBeNull();
    expect(parsed.parsed.notes).toEqual([]);
    expect(parsed.parsed.userProfileContext).toContain("Prefer concise");
    expect(parsed.parsed.rpmSuggestion?.content).toContain("weekly updates");
    expect(parsed.parsed.transactionEvent?.hoursPurchased).toBe(20);
    expect(parsed.parsed.approvals[0]).toEqual({ suggestionId: "abc-123", decision: "approve" });
  });

  it("decodes HTML entities in labeled sections", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "[Project: Revamp] Update",
      text: `
Summary:
Tom &amp; Jerry

Action Items:
- Draft &amp; review

Decisions:
- Use &lt;Supabase&gt;
`,
    };

    const parsed = parseInbound(payload, "resend");

    expect(parsed.from).toBe("user@example.com");
    expect(parsed.parsed.summary).toBe("Tom & Jerry");
    expect(parsed.parsed.goals).toEqual([]);
    expect(parsed.parsed.actionItems).toEqual(["Draft & review"]);
    expect(parsed.parsed.decisions).toEqual(["Use <Supabase>"]);
    expect(parsed.parsed.risks).toEqual([]);
    expect(parsed.parsed.notes).toEqual([]);
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

  it("falls back to raw body in notes when meaning fields are empty", () => {
    const payload = {
      from: "user@example.com",
      subject: "No labels test",
      text: "I want to build an AI SaaS for real estate agents.",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.from).toBe("user@example.com");
    expect(parsed.parsed.summary).toBeNull();
    expect(parsed.parsed.goals).toEqual([]);
    expect(parsed.parsed.actionItems).toEqual([]);
    expect(parsed.parsed.risks).toEqual([]);
    expect(parsed.parsed.notes).toEqual(["I want to build an AI SaaS for real estate agents."]);
  });

  it("parses Status and drops notes that duplicate Summary", () => {
    const payload = {
      from: "user@example.com",
      subject: "Status test",
      text: `Summary:
One line overview.

Status:
Building MVP — on track.

Notes:
- One line overview.
- Extra detail only in notes.
`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.summary).toContain("One line overview");
    expect(parsed.parsed.currentStatus).toContain("Building MVP");
    expect(parsed.parsed.notes).toEqual(["Extra detail only in notes."]);
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

  it("normalizes to/cc string arrays that include display names", () => {
    const payload = {
      from: "owner@example.com",
      to: ["Owner Team <owner.team@example.com>", "support@example.com"],
      cc: ["Advisor <advisor@example.com>"],
      text: "Summary:\nRecipient normalization",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.to).toEqual(["owner.team@example.com", "support@example.com"]);
    expect(parsed.cc).toEqual(["advisor@example.com"]);
  });

  it("uses deterministic providerEventId fallback when inbound ids are missing", () => {
    const payload = {
      from: "Owner <owner@example.com>",
      subject: "Fallback id test",
      text: "Summary:\nStable content for fallback",
    };

    const first = parseInbound(payload, "resend");
    const second = parseInbound(payload, "resend");

    expect(first.providerEventId).toBe(second.providerEventId);
    expect(first.providerEventId.startsWith("generated-")).toBe(true);
  });

  it("uses payload created_at for event and suggestion timestamps", () => {
    const payload = {
      id: "evt_999",
      created_at: "2026-03-01T10:00:00.000Z",
      data: {
        from: "Owner <owner@example.com>",
        text: "Summary:\nTimestamp source\n\nUserProfile Suggestion:\nUse concise updates.",
      },
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.timestamp).toBe("2026-03-01T10:00:00.000Z");
    expect(parsed.parsed.rpmSuggestion?.timestamp).toBe("2026-03-01T10:00:00.000Z");
  });

  it("parses SaaS fee labels without alternation side effects", () => {
    const payload = {
      from: "User <user@example.com>",
      text: `Summary:
Tx check

Transaction:
Hours Purchased: 10
Hourly Rate: 100
Allocated to Freelancer: 8
Buffer: 1
Please include SaaS2 Fee in your notes before finalization.
SaaS² Fee: 1
Project Remainder: 1`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.transactionEvent?.saas2Fee).toBe(1);
    expect(parsed.parsed.transactionEvent?.projectRemainder).toBe(1);
  });

  it("parses simple transaction hours/rate and approval command id", () => {
    const payload = {
      from: "User <user@example.com>",
      text: `Transaction:
Hours: 10
Rate: $50

Approve suggestion 123`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.transactionEvent?.hoursPurchased).toBe(10);
    expect(parsed.parsed.transactionEvent?.hourlyRate).toBe(50);
    expect(parsed.parsed.transactionEvent?.allocatedHours).toBe(9);
    expect(parsed.parsed.transactionEvent?.bufferHours).toBe(1);
    expect(parsed.parsed.transactionEvent?.saas2Fee).toBe(50);
    expect(parsed.parsed.approvals).toEqual([{ suggestionId: "123", decision: "approve" }]);
    expect(parsed.parsed.notes).toEqual([]);
  });
});
