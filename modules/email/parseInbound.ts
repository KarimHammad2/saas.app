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

function toObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toObjectFromUnknown(value: unknown): Record<string, unknown> | null {
  const objectValue = toObjectOrNull(value);
  if (objectValue) {
    return objectValue;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return toObjectOrNull(parsed);
  } catch {
    return null;
  }
}

function nestedString(source: Record<string, unknown>, path: string[]): string {
  let current: unknown = source;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return toStringOrEmpty(current);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
  }
  return [];
}

function pickSource(root: Record<string, unknown>): Record<string, unknown> {
  const candidates = [root.data, root.payload, root.mail, root.Message, root];
  for (const candidate of candidates) {
    const objectCandidate = toObjectFromUnknown(candidate);
    if (objectCandidate) {
      return objectCandidate;
    }
  }

  return root;
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

function extractSenderRaw(source: Record<string, unknown>): string {
  const fromRaw = source.from;
  const fromAliasRaw = source.From;
  const senderRaw = source.sender;
  const senderAliasRaw = source.sender_email;
  const fromEmailAlias = source.from_email;
  const fromFullEmail = nestedString(source, ["FromFull", "Email"]);
  if (fromFullEmail) {
    return fromFullEmail;
  }

  if (typeof fromRaw === "string" && fromRaw.trim()) {
    return fromRaw.trim();
  }

  if (typeof fromAliasRaw === "string" && fromAliasRaw.trim()) {
    return fromAliasRaw.trim();
  }

  if (typeof senderRaw === "string" && senderRaw.trim()) {
    return senderRaw.trim();
  }

  if (typeof senderAliasRaw === "string" && senderAliasRaw.trim()) {
    return senderAliasRaw.trim();
  }

  if (typeof fromEmailAlias === "string" && fromEmailAlias.trim()) {
    return fromEmailAlias.trim();
  }

  const fromObject = fromRaw && typeof fromRaw === "object" && !Array.isArray(fromRaw) ? (fromRaw as Record<string, unknown>) : null;
  const fromAliasObject =
    fromAliasRaw && typeof fromAliasRaw === "object" && !Array.isArray(fromAliasRaw) ? (fromAliasRaw as Record<string, unknown>) : null;
  const fromObjects = [fromObject, fromAliasObject];
  for (const candidate of fromObjects) {
    if (!candidate) {
      continue;
    }
    const email = toStringOrEmpty(candidate.email);
    if (email) {
      return email;
    }
    const address = toStringOrEmpty(candidate.address);
    if (address) {
      return address;
    }
    const nestedEmail = nestedString(candidate, ["Email"]);
    if (nestedEmail) {
      return nestedEmail;
    }
  }

  const fromList = Array.isArray(fromRaw) ? fromRaw : [];
  for (const entry of fromList) {
    if (typeof entry === "string" && entry.trim()) {
      return entry.trim();
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const email = toStringOrEmpty((entry as Record<string, unknown>).email);
      if (email) {
        return email;
      }
      const address = toStringOrEmpty((entry as Record<string, unknown>).address);
      if (address) {
        return address;
      }
    }
  }

  return "";
}

function extractRecipientEmails(value: unknown): string[] {
  const emails: string[] = [];

  if (typeof value === "string") {
    return splitEmails(value);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  for (const entry of value) {
    if (typeof entry === "string") {
      for (const email of splitEmails(entry)) {
        emails.push(email);
      }
      continue;
    }

    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const email = toStringOrEmpty((entry as Record<string, unknown>).email);
      const address = toStringOrEmpty((entry as Record<string, unknown>).address);
      const candidate = email || address;
      if (!candidate) {
        continue;
      }
      try {
        emails.push(extractEmailAddress(candidate));
      } catch {
        continue;
      }
    }
  }

  return emails;
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

function extractBodyContent(source: Record<string, unknown>): string {
  const textBody = toStringOrEmpty(source.text);
  if (textBody) {
    return textBody;
  }

  const textBodyAlias = toStringOrEmpty(source.TextBody) || toStringOrEmpty(source["stripped-text"]) || toStringOrEmpty(source.plain);
  if (textBodyAlias) {
    return textBodyAlias;
  }

  const htmlBody = toStringOrEmpty(source.html);
  if (htmlBody) {
    return stripHtml(htmlBody);
  }

  const htmlBodyAlias = toStringOrEmpty(source.HtmlBody) || toStringOrEmpty(source["stripped-html"]);
  if (htmlBodyAlias) {
    return stripHtml(htmlBodyAlias);
  }

  // Some providers send raw content in message/body/content fields.
  const messageBody = toStringOrEmpty(source.message);
  if (messageBody) {
    return messageBody;
  }

  const messageAlias = toStringOrEmpty(source.Message) || nestedString(source, ["content", "text"]) || nestedString(source, ["content", "plain"]);
  if (messageAlias) {
    return messageAlias;
  }

  const bodyField = toStringOrEmpty(source.body);
  if (bodyField) {
    return bodyField;
  }

  const bodyAlias = toStringOrEmpty(source.Body) || nestedString(source, ["Body", "Text"]) || nestedString(source, ["Body", "Html"]);
  if (bodyAlias) {
    return bodyAlias;
  }

  const contentField = toStringOrEmpty(source.content);
  if (contentField) {
    return contentField;
  }

  const nestedSourceBody = nestedString(source, ["data", "text"]) || nestedString(source, ["data", "html"]);
  if (nestedSourceBody) {
    return nestedSourceBody;
  }

  return "";
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
  const root = toObject(payload);
  const source = pickSource(root);
  const senderRaw = extractSenderRaw(source);
  const subject = toStringOrEmpty(source.subject) || "No Subject";
  const messageId =
    toStringOrEmpty(root.id) ||
    toStringOrEmpty(source.id) ||
    toStringOrEmpty(source.messageId) ||
    toStringOrEmpty(source["Message-Id"]) ||
    toStringOrEmpty(source.email_id) ||
    crypto.randomUUID();

  if (!senderRaw) {
    throw new InboundParseError("Inbound payload is missing sender email.");
  }

  const senderEmail = extractEmailAddress(senderRaw);
  const rawBody = extractBodyContent(source);
  if (!rawBody) {
    throw new InboundParseError("Inbound payload is missing email body content.");
  }

  const cleanedBody = normalizeWhitespace(stripSignatureAndQuoted(rawBody));
  const to = (() => {
    const fromStrings = toStringArray(source.to);
    if (fromStrings.length > 0) {
      return fromStrings;
    }
    const fromObjects = extractRecipientEmails(source.to);
    if (fromObjects.length > 0) {
      return fromObjects;
    }
    return splitEmails(toStringOrEmpty(source.to));
  })();

  const cc = (() => {
    const fromStrings = toStringArray(source.cc);
    if (fromStrings.length > 0) {
      return fromStrings;
    }
    const fromObjects = extractRecipientEmails(source.cc);
    if (fromObjects.length > 0) {
      return fromObjects;
    }
    return splitEmails(toStringOrEmpty(source.cc));
  })();
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
