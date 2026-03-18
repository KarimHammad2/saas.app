import type { NormalizedEmailEvent, TransactionEvent } from "@/modules/contracts/types";

export class InboundParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboundParseError";
  }
}

const SECTION_LABELS = [
  "Summary",
  "Goals",
  "Action Items",
  "Decisions",
  "Risks",
  "Recommendations",
  "Transaction",
  "UserProfile",
  "UserProfile Suggestion",
] as const;

function toObject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InboundParseError("Inbound payload must be a JSON object.");
  }
  return payload as Record<string, unknown>;
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
  }
  return [];
}

function normalizeWhitespace(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\u2022/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(content: string): string {
  return content
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function stripSignatureAndQuoted(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^on .+wrote:$/i.test(trimmed)) {
      break;
    }
    if (trimmed.startsWith(">")) {
      continue;
    }
    if (/^--\s*$/.test(trimmed)) {
      break;
    }
    result.push(line);
  }

  return result.join("\n");
}

function extractEmailAddress(value: string): string {
  const angleMatch = value.match(/<([^>]+)>/);
  const candidate = angleMatch?.[1] ?? value;
  const normalized = candidate.trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!isEmail) {
    throw new InboundParseError("Could not extract a valid sender email.");
  }
  return normalized;
}

function splitEmails(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      try {
        return extractEmailAddress(part);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function extractSection(content: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const allLabels = SECTION_LABELS.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(?:^|\\n)${escaped}:\\s*([\\s\\S]*?)(?=\\n(?:${allLabels}):|$)`, "i");
  const match = content.match(regex);
  return match?.[1]?.trim() ?? "";
}

function toBulletList(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function parseTransactionBlock(content: string): TransactionEvent | null {
  if (!content.trim()) {
    return null;
  }

  const valueByLabel = (label: string): number => {
    const match = content.match(new RegExp(`${label}\\s*:\\s*([\\d.]+)`, "i"));
    return Number(match?.[1] ?? 0);
  };

  const event: TransactionEvent = {
    hoursPurchased: valueByLabel("Hours Purchased"),
    hourlyRate: valueByLabel("Hourly Rate"),
    allocatedHours: valueByLabel("Allocated to Freelancer"),
    bufferHours: valueByLabel("Buffer"),
    saas2Fee: valueByLabel("SaaS2 Fee|SaaS² Fee"),
    projectRemainder: valueByLabel("Project Remainder"),
  };

  if (event.hoursPurchased <= 0 || event.hourlyRate <= 0) {
    return null;
  }

  return event;
}

function parseApprovals(content: string): { suggestionId: string }[] {
  const approvals: { suggestionId: string }[] = [];
  const regex = /approve suggestion\s+([a-f0-9-]{6,})/gi;
  for (const match of content.matchAll(regex)) {
    approvals.push({ suggestionId: match[1] });
  }
  return approvals;
}

function parseAdditionalEmails(content: string): string[] {
  const block =
    extractSection(content, "Team Emails") ||
    extractSection(content, "Additional Emails") ||
    extractSection(content, "Agency Emails");

  if (!block) {
    return [];
  }

  return block
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return extractEmailAddress(entry);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

export function parseNormalizedContent(content: string) {
  const summary = extractSection(content, "Summary");
  const goals = toBulletList(extractSection(content, "Goals"));
  const actionItems = toBulletList(extractSection(content, "Action Items"));
  const decisions = toBulletList(extractSection(content, "Decisions"));
  const risks = toBulletList(extractSection(content, "Risks"));
  const recommendations = toBulletList(extractSection(content, "Recommendations"));
  const userProfileContext = extractSection(content, "UserProfile") || extractSection(content, "Context");
  const rpmSuggestionContent = extractSection(content, "UserProfile Suggestion");
  const transactionEvent = parseTransactionBlock(extractSection(content, "Transaction"));
  const approvals = parseApprovals(content);
  const additionalEmails = parseAdditionalEmails(content);

  return {
    summary: summary || null,
    goals,
    actionItems,
    decisions,
    risks,
    recommendations,
    userProfileContext: userProfileContext || null,
    rpmSuggestion: rpmSuggestionContent
      ? {
          content: rpmSuggestionContent,
          from: "",
          timestamp: new Date().toISOString(),
        }
      : null,
    transactionEvent,
    approvals,
    additionalEmails,
  };
}

export function parseInbound(payload: unknown, provider = "generic"): NormalizedEmailEvent {
  const source = toObject(payload);
  const senderRaw = toStringOrEmpty(source.from) || toStringOrEmpty(source.sender);
  const subject = toStringOrEmpty(source.subject) || "No Subject";
  const textBody = toStringOrEmpty(source.text);
  const htmlBody = toStringOrEmpty(source.html);
  const messageId =
    toStringOrEmpty(source.messageId) || toStringOrEmpty(source["Message-Id"]) || crypto.randomUUID();

  if (!senderRaw) {
    throw new InboundParseError("Inbound payload is missing sender email.");
  }

  const senderEmail = extractEmailAddress(senderRaw);
  const rawBody = textBody || stripHtml(htmlBody);
  if (!rawBody) {
    throw new InboundParseError("Inbound payload is missing email body content.");
  }

  const cleanedBody = normalizeWhitespace(stripSignatureAndQuoted(rawBody));
  const to = toStringArray(source.to).length > 0 ? toStringArray(source.to) : splitEmails(toStringOrEmpty(source.to));
  const cc = toStringArray(source.cc).length > 0 ? toStringArray(source.cc) : splitEmails(toStringOrEmpty(source.cc));
  const parsed = parseNormalizedContent(cleanedBody);

  if (parsed.rpmSuggestion) {
    parsed.rpmSuggestion.from = senderEmail;
  }

  return {
    eventId: crypto.randomUUID(),
    provider,
    providerEventId: messageId,
    timestamp: new Date().toISOString(),
    from: senderEmail,
    to,
    cc,
    subject,
    rawBody: cleanedBody,
    parsed,
  };
}
