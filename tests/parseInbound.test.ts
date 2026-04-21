import { describe, expect, it } from "vitest";
import {
  InboundParseError,
  isIgnoredNoteInput,
  parseInbound,
  parseNormalizedContent,
  parseProjectCodeFromSubject,
} from "@/modules/email/parseInbound";

describe("parseProjectCodeFromSubject", () => {
  it("extracts bracketed PJT code in lowercase db form", () => {
    expect(parseProjectCodeFromSubject("Re: Hello [PJT-A1B2C3D4]")).toBe("pjt-a1b2c3d4");
    expect(parseProjectCodeFromSubject("No token")).toBeNull();
  });
});

describe("parseInbound", () => {
  it("extracts In-Reply-To and References for threading", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "Re: Update",
      text: "Body line",
      "In-Reply-To": "<AbC123@mail.com>",
      References: "<prev@mail.com> <AbC123@mail.com>",
    };
    const parsed = parseInbound(payload, "resend");
    expect(parsed.inReplyTo).toBe("abc123@mail.com");
    expect(parsed.references).toContain("prev@mail.com");
    expect(parsed.references).toContain("abc123@mail.com");
  });

  it("extracts strict memory sections and special command sections", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "[Project: Revamp] Update",
      text: `
Goals:
- Launch MVP

Tasks:
- Draft architecture

Decisions:
- Use Supabase

Project Status:
- Paused

Risks:
- Timeline slippage

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
Reject suggestion def-456
`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.from).toBe("user@example.com");
    expect(parsed.fromDisplayName).toBe("User");
    expect(parsed.parsed.summary).toBeNull();
    expect(parsed.parsed.goals).toEqual(["Launch MVP"]);
    expect(parsed.parsed.actionItems).toEqual(["Draft architecture"]);
    expect(parsed.parsed.decisions).toEqual(["Use Supabase"]);
    expect(parsed.parsed.risks).toEqual(["Timeline slippage"]);
    expect(parsed.parsed.recommendations).toEqual([]);
    expect(parsed.parsed.currentStatus).toBeNull();
    expect(parsed.parsed.projectStatus).toBe("paused");
    expect(parsed.parsed.notes).toEqual([]);
    expect(parsed.parsed.userProfileContext).toContain("Prefer concise");
    expect(parsed.parsed.rpmSuggestion?.content).toContain("weekly updates");
    expect(parsed.parsed.transactionEvent?.hoursPurchased).toBe(20);
    expect(parsed.parsed.approvals[0]).toEqual({ suggestionId: "abc-123", decision: "approve" });
    expect(parsed.parsed.approvals[1]).toEqual({ suggestionId: "def-456", decision: "reject" });
  });

  it("extracts Correction and RPM Correction bodies", () => {
    const onlyCorrection = parseInbound(
      {
        from: "rpm@example.com",
        subject: "Re: Update",
        text: "Correction:\nThe timeline should be 4 weeks, not 2.\n",
      },
      "resend",
    );
    expect(onlyCorrection.parsed.correction).toContain("4 weeks");

    const rpmPrefixed = parseInbound(
      {
        from: "rpm@example.com",
        subject: "Re: Update",
        text: "RPM Correction:\nUse the March 15 deadline.\n",
      },
      "resend",
    );
    expect(rpmPrefixed.parsed.correction).toContain("March 15");
  });

  it("extracts Assign RPM email and normalizes case", () => {
    const parsed = parseInbound(
      {
        from: "owner@agency.com",
        subject: "Re: Project",
        text: "Assign RPM:\nrpm-lead@agency.com\n",
      },
      "resend",
    );
    expect(parsed.parsed.assignRpmEmail).toBe("rpm-lead@agency.com");
  });

  it("treats Assign RPM only message as structured with empty notes", () => {
    const parsed = parseInbound(
      {
        from: "owner@agency.com",
        subject: "Re: Project",
        text: "Assign RPM:\nother@agency.com\n",
      },
      "resend",
    );
    expect(parsed.parsed.assignRpmEmail).toBe("other@agency.com");
    expect(parsed.parsed.notes).toEqual([]);
  });

  it("parses markdown-style section headers and dedupes list entries", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "Markdown sections",
      text: `
## Goals
- Launch MVP
- launch   mvp

**Tasks**
- Build onboarding flow
- [x] Build onboarding flow

## Risks
- Timeline risk
- timeline    risk

Decisions:
- Use Supabase
- use supabase
`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.goals).toEqual(["Launch MVP"]);
    expect(parsed.parsed.actionItems).toEqual(["Build onboarding flow"]);
    expect(parsed.parsed.risks).toEqual(["Timeline risk"]);
    expect(parsed.parsed.decisions).toEqual(["Use Supabase"]);
  });

  it("extracts project name from Project Name section", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "Re: Project Update — Old Name [PJT-A1B2C3D4]",
      text: `
Project Name:
- SMS SaaS Platform
`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.projectName).toBe("SMS SaaS Platform");
  });

  it("extracts project name from rename command", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "Re: Project Update — Old Name [PJT-A1B2C3D4]",
      text: "Rename project to: AI PDF Tool",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.projectName).toBe("AI PDF Tool");
  });

  it("decodes HTML entities in strict labeled sections", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "[Project: Revamp] Update",
      text: `
Tasks:
- Draft &amp; review

Decisions:
- Use &lt;Supabase&gt;
`,
    };

    const parsed = parseInbound(payload, "resend");

    expect(parsed.from).toBe("user@example.com");
    expect(parsed.parsed.summary).toBeNull();
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
        text: "Goals:\n- Confirm resend payload support",
        email_id: "a8e65746-13a5-49b1-9768-ca4ff213a3d3",
      },
      type: "email.received",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.provider).toBe("resend");
    expect(parsed.providerEventId).toBe("evt_123");
    expect(parsed.from).toBe("karim@example.com");
    expect(parsed.to).toEqual(["frank@sign-unlimit.com"]);
    expect(parsed.parsed.summary).toBeNull();
    expect(parsed.parsed.goals).toEqual(["Confirm resend payload support"]);
  });

  it("falls back to raw message field when text/html are missing", () => {
    const payload = {
      id: "evt_raw_1",
      data: {
        from: "Karim <karim@example.com>",
        subject: "[Project: Real Life Test] Kickoff",
        message: "Goals:\n- Parse from message field",
      },
      type: "email.received",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.from).toBe("karim@example.com");
    expect(parsed.parsed.summary).toBeNull();
    expect(parsed.parsed.goals).toEqual(["Parse from message field"]);
  });

  it("extracts attachments and flags PDF by filename", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "Attachment test",
      text: "Goals:\n- Review docs",
      attachments: [{ filename: "brief.pdf", contentType: "application/octet-stream" }],
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.attachments).toEqual([{ filename: "brief.pdf", contentType: "application/octet-stream", isPdf: true }]);
  });

  it("extracts attachments and flags PDF by mime type", () => {
    const payload = {
      subject: "Attachment test",
      text: "Goals:\n- Review docs",
      data: {
        from: "User <user@example.com>",
        text: "Goals:\n- Review docs",
        attachments: [{ filename: "brief.bin", contentType: "application/pdf" }],
      },
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.attachments).toEqual([{ filename: "brief.bin", contentType: "application/pdf", isPdf: true }]);
  });

  it("does not flag non-PDF attachments", () => {
    const payload = {
      from: "User <user@example.com>",
      subject: "Attachment test",
      text: "Goals:\n- Review docs",
      files: [{ name: "notes.txt", type: "text/plain" }],
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.attachments).toEqual([{ filename: "notes.txt", contentType: "text/plain", isPdf: false }]);
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
      TextBody: "Goals:\n- Parse TextBody and FromFull",
      subject: "Alias test",
    };

    const parsed = parseInbound(payload, "ses");
    expect(parsed.from).toBe("alias.sender@example.com");
    expect(parsed.parsed.summary).toBeNull();
    expect(parsed.parsed.goals).toEqual(["Parse TextBody and FromFull"]);
  });

  it("does not treat punctuation-only or ultra-short bodies as notes", () => {
    const dotPayload = {
      from: "user@example.com",
      subject: "Dots",
      text: "....",
    };
    expect(parseInbound(dotPayload, "resend").parsed.notes).toEqual([]);

    const shortPayload = {
      from: "user@example.com",
      subject: "Short",
      text: "hi",
    };
    expect(parseInbound(shortPayload, "resend").parsed.notes).toEqual([]);
  });

  it("isIgnoredNoteInput matches plan rules", () => {
    expect(isIgnoredNoteInput("....")).toBe(true);
    expect(isIgnoredNoteInput(" - _ ")).toBe(true);
    expect(isIgnoredNoteInput("hi")).toBe(true);
    expect(isIgnoredNoteInput("hello")).toBe(true);
    expect(isIgnoredNoteInput("Shipped onboarding and started billing integration")).toBe(false);
  });

  it("drops low-signal lines from Notes section", () => {
    const payload = {
      from: "user@example.com",
      subject: "Notes filter",
      text: `Notes:
- ....
- Real note with enough text here.`,
    };
    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.notes).toEqual(["Real note with enough text here."]);
  });

  it("falls back to raw body in notes when meaning fields are empty", () => {
    const payload = {
      from: "user@example.com",
      subject: "No labels test",
      text: "I want to build an AI SaaS for real estate agents.",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.from).toBe("user@example.com");
    expect(parsed.parsed.summary).toBe("I want to build an AI SaaS for real estate agents.");
    expect(parsed.parsed.goals).toEqual([]);
    expect(parsed.parsed.actionItems).toEqual([]);
    expect(parsed.parsed.risks).toEqual([]);
    expect(parsed.parsed.notes).toEqual(["I want to build an AI SaaS for real estate agents."]);
  });

  it("cleans conversational filler from messy overview input", () => {
    const payload = {
      from: "user@example.com",
      subject: "Messy idea",
      text: "Hey so yeah basically I'm thinking maybe something like a SaaS for restaurants idk...",
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.rawBody).toBe(
      "Hey so yeah basically I'm thinking maybe something like a SaaS for restaurants idk...",
    );
    expect(parsed.parsed.summary).toBe("thing like a SaaS for restaurants.");
  });

  it("parses canonical Project Status section while keeping Summary strict", () => {
    const payload = {
      from: "user@example.com",
      subject: "Status test",
      text: `Summary:
One line overview.

Project Status:
Completed

Notes:
- One line overview.
- Extra detail only in notes.
`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.summary).toContain("One line overview");
    expect(parsed.parsed.currentStatus).toBeNull();
    expect(parsed.parsed.projectStatus).toBe("completed");
    expect(parsed.parsed.notes).toEqual(["One line overview.", "Extra detail only in notes."]);
  });

  it("normalizes lifecycle status values case-insensitively", () => {
    const payload = {
      from: "user@example.com",
      subject: "Status normalization",
      text: `Project Status:
- ACTIVE`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.projectStatus).toBe("active");
    expect(parsed.parsed.currentStatus).toBeNull();
  });

  it("still accepts legacy Status label for backwards compatibility", () => {
    const payload = {
      from: "user@example.com",
      subject: "Legacy status",
      text: `Status:
- paused`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.projectStatus).toBe("paused");
  });

  it("merges Action Items with Tasks and parses Recommendations", () => {
    const payload = {
      from: "user@example.com",
      subject: "Strict section parsing",
      text: `Action Items:
- Alias line

Recommendations:
- Stakeholder review

Tasks:
- Canonical task should parse
`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.actionItems).toEqual(["Canonical task should parse", "Alias line"]);
    expect(parsed.parsed.recommendations).toEqual(["Stakeholder review"]);
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

  it("parses transaction block for hours and rate only (ignores labeled buffer lines in email)", () => {
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
    expect(parsed.parsed.transactionEvent?.hoursPurchased).toBe(10);
    expect(parsed.parsed.transactionEvent?.hourlyRate).toBe(100);
    expect(parsed.parsed.transactionEvent?.allocatedHours).toBe(0);
    expect(parsed.parsed.transactionEvent?.bufferHours).toBe(0);
    expect(parsed.parsed.transactionEvent?.saas2Fee).toBe(0);
    expect(parsed.parsed.transactionEvent?.projectRemainder).toBe(0);
  });

  it("parses transaction block when Gmail-style bold markdown wraps labels", () => {
    const payload = {
      from: "User <user@example.com>",
      text: `**Transaction:**

**Hours Purchased:** 20
**Hourly Rate:** 50
**Allocated to Freelancer:** 18
**Buffer:** 2
**SaaS2 Fee:** 1
**Project Remainder:** 1`,
    };

    const parsed = parseInbound(payload, "resend");
    expect(parsed.parsed.transactionEvent?.hoursPurchased).toBe(20);
    expect(parsed.parsed.transactionEvent?.hourlyRate).toBe(50);
  });

  it("detects CAD on Hourly Rate line for checkout currency", () => {
    const body = `Transaction:
Hours Purchased: 10
Hourly Rate: CAD 100
`;
    const p = parseNormalizedContent(body);
    expect(p.transactionEvent?.hourlyRate).toBe(100);
    expect(p.transactionEvent?.rateCurrency).toBe("cad");
  });

  it("detects CAD with CA$ on rate line", () => {
    const p = parseNormalizedContent(`Transaction:
Hours: 5
Hourly Rate: CA$75
`);
    expect(p.transactionEvent?.hourlyRate).toBe(75);
    expect(p.transactionEvent?.rateCurrency).toBe("cad");
  });

  it("defaults to USD when rate line has $ without CAD", () => {
    const p = parseNormalizedContent(`Transaction:
Hours: 10
Rate: $50
`);
    expect(p.transactionEvent?.hourlyRate).toBe(50);
    expect(p.transactionEvent?.rateCurrency).toBeUndefined();
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
    expect(parsed.parsed.transactionEvent?.allocatedHours).toBe(0);
    expect(parsed.parsed.transactionEvent?.bufferHours).toBe(0);
    expect(parsed.parsed.transactionEvent?.saas2Fee).toBe(0);
    expect(parsed.parsed.approvals).toEqual([{ suggestionId: "123", decision: "approve" }]);
    expect(parsed.parsed.notes).toEqual([]);
  });

  it("parses bare approve or reject without a suggestion id", () => {
    expect(parseNormalizedContent("approve").approvals).toEqual([{ suggestionId: null, decision: "approve" }]);
    expect(parseNormalizedContent("reject").approvals).toEqual([{ suggestionId: null, decision: "reject" }]);
    expect(parseNormalizedContent("Approved.").approvals).toEqual([{ suggestionId: null, decision: "approve" }]);
  });

  it("prefers explicit approve/reject suggestion ids over bare words", () => {
    const mixed = parseNormalizedContent("approve suggestion keep-me\napprove");
    expect(mixed.approvals).toEqual([{ suggestionId: "keep-me", decision: "approve" }]);
  });
});

describe("payment received ack", () => {
  it("detects standalone Paid (case-insensitive, optional period)", () => {
    expect(parseNormalizedContent("Paid").paymentReceivedAck).toBe(true);
    expect(parseNormalizedContent("paid.").paymentReceivedAck).toBe(true);
    expect(parseNormalizedContent("  PAID  ").paymentReceivedAck).toBe(true);
  });

  it("does not set ack when combined with other lines or a Transaction block", () => {
    expect(parseNormalizedContent("Paid\nGoals: x").paymentReceivedAck).toBe(false);
    expect(
      parseNormalizedContent("Transaction:\nHours Purchased: 1\nHourly Rate: 10\nPaid").paymentReceivedAck,
    ).toBe(false);
  });
});

describe("parseNormalizedContent extended project sections", () => {
  it("merges Tasks and Action Items with stable ordering", () => {
    const raw = "Tasks:\n- First task\n\nAction Items:\n- Second task\n";
    const p = parseNormalizedContent(raw);
    expect(p.actionItems).toEqual(["First task", "Second task"]);
    expect(p.projectSectionPresence.tasks).toBe(true);
    expect(p.projectSectionPresence.actionItems).toBe(true);
  });

  it("merges Risk and Risks headings", () => {
    const raw = "Risks:\n- Schedule risk\n\nRisk:\n- Budget risk\n";
    const p = parseNormalizedContent(raw);
    expect(p.risks).toEqual(["Schedule risk", "Budget risk"]);
    expect(p.projectSectionPresence.risks).toBe(true);
  });

  it("parses Summary block and Recommendations lists", () => {
    const raw = "Summary:\nLaunch readiness by Friday.\n\nRecommendations:\n- Add QA\n- Brief stakeholders\n";
    const p = parseNormalizedContent(raw);
    expect(p.summary).toContain("Launch readiness");
    expect(p.recommendations).toEqual(["Add QA", "Brief stakeholders"]);
    expect(p.projectSectionPresence.summary).toBe(true);
    expect(p.projectSectionPresence.recommendations).toBe(true);
  });

  it("parses FollowUp blocks and resolves relative dates from the inbound timestamp", () => {
    const raw = `
FollowUp:
- Action: Follow up with John about API access
- Target: John
- When: Tomorrow
`;
    const p = parseNormalizedContent(raw, {
      timestamp: "2026-04-21T12:00:00.000Z",
    });

    expect(p.followUps).toEqual([
      {
        action: "Follow up with John about API access",
        target: "John",
        whenText: "Tomorrow",
        dueDate: "2026-04-22",
        status: "pending",
      },
    ]);
    expect(p.projectSectionPresence.followUps).toBe(true);
  });
});

describe("parseNormalizedContent Gmail-style single-asterisk headings", () => {
  // Gmail's text/plain export of HTML bold uses single asterisks (e.g. `*Goals:*`),
  // which previously slipped past section detection and dumped everything into Notes.
  it("routes bullets under *Goals:*, *Decisions:*, *Tasks:*, *Risks:* into their sections", () => {
    const raw = `*Project Name:*
- AI Management Platform

*Goals:*
- Build an MVP that generates structured project plans from a plain-text brief.
- Target small teams of 2-10 people.
- Ship one core workflow before expanding features.

*Decisions:*
- MVP scope defined: brief input to AI-generated plan.
- Out of scope for MVP: integrations, AI agents, reporting, mobile app.
- Build approach: hire a developer.

*Tasks:*
- Hire a developer for MVP build.
- Validate MVP concept with 5 target users.
- Set first milestone date for working prototype.

*Risks:*
- Scope creep before MVP is shipped.
- Developer availability and cost overrun.
`;
    const p = parseNormalizedContent(raw);

    expect(p.goals).toEqual([
      "Build an MVP that generates structured project plans from a plain-text brief.",
      "Target small teams of 2-10 people.",
      "Ship one core workflow before expanding features.",
    ]);
    expect(p.decisions).toEqual([
      "MVP scope defined: brief input to AI-generated plan.",
      "Out of scope for MVP: integrations, AI agents, reporting, mobile app.",
      "Build approach: hire a developer.",
    ]);
    expect(p.actionItems).toEqual([
      "Hire a developer for MVP build.",
      "Validate MVP concept with 5 target users.",
      "Set first milestone date for working prototype.",
    ]);
    expect(p.risks).toEqual([
      "Scope creep before MVP is shipped.",
      "Developer availability and cost overrun.",
    ]);
    expect(p.notes).toEqual([]);
    expect(p.projectSectionPresence.goals).toBe(true);
    expect(p.projectSectionPresence.decisions).toBe(true);
    expect(p.projectSectionPresence.tasks).toBe(true);
    expect(p.projectSectionPresence.risks).toBe(true);
    expect(p.projectName).toBe("AI Management Platform");
  });

  it("accepts asymmetric emphasis like *Goals*: and *Goals:* and _Goals_:", () => {
    const asteriskOutside = parseNormalizedContent("*Goals*:\n- One\n");
    expect(asteriskOutside.goals).toEqual(["One"]);

    const asteriskInside = parseNormalizedContent("*Goals:*\n- Two\n");
    expect(asteriskInside.goals).toEqual(["Two"]);

    const underscore = parseNormalizedContent("_Goals_:\n- Three\n");
    expect(underscore.goals).toEqual(["Three"]);
  });

  it("does not treat emphasised non-label lines as section headings", () => {
    // `*Ship it now:*` is not one of SECTION_LABELS, so it must not be normalised
    // into a section heading and the content must remain inside the preceding section.
    const raw = "Goals:\n- Ship v1\n- Validate concept\n*Ship it now:*\n- extra\n";
    const p = parseNormalizedContent(raw);
    expect(p.goals).toContain("Ship v1");
    expect(p.goals).toContain("Validate concept");
    // The non-label emphasised line should not create a new section; the goals block continues.
    expect(p.projectSectionPresence.notes).toBe(false);
  });
});
