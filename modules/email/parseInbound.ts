import type { NormalizedEmailEvent, ProjectStatus, TransactionEvent } from "@/modules/contracts/types";
import { cleanOverviewText } from "@/modules/domain/overviewCleaning";
import { normalizeProjectNameCandidate } from "@/modules/domain/projectName";
import { filterIgnoredNoteLines, isIgnoredNoteInput } from "@/modules/email/noteInputValidation";
import { extractDisplayNameFromSenderRaw, tryNormalizeEmailAddress } from "@/modules/email/emailAddress";
import { normalizeMessageId } from "@/modules/email/messageId";
import { stripQuotedReply } from "@/modules/email/stripQuotedReply";
import { createHash } from "node:crypto";

export class InboundParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboundParseError";
  }
}

const MEMORY_SECTION_LABELS = [
  "Goals",
  "Tasks",
  "Completed",
  "Decisions",
  "Risks",
  "Notes",
  // No aliases allowed for strict memory sections.
] as const;

const SPECIAL_SECTION_LABELS = [
  "Transaction",
  "Project Status",
  "Status",
  "UserProfile",
  "Context",
  "UserProfile Suggestion",
  "Project Name",
  "Team Emails",
  "Additional Emails",
  "Agency Emails",
] as const;

const SECTION_LABELS = [...MEMORY_SECTION_LABELS, ...SPECIAL_SECTION_LABELS] as const;

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

function toStringOrNull(value: unknown): string | null {
  const normalized = toStringOrEmpty(value);
  return normalized || null;
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

function decodeHtmlEntities(content: string): string {
  let output = content;

  // Common named entities seen in email clients.
  output = output
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");

  // Numeric entities: &#123; and &#x1A;
  output = output
    .replace(/&#(\d+);/g, (match, num) => {
      const codePoint = Number(num);
      if (!Number.isFinite(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      const codePoint = parseInt(hex, 16);
      if (!Number.isFinite(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    });

  return output;
}

function normalizeForDedup(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export { isIgnoredNoteInput } from "@/modules/email/noteInputValidation";

function normalizeWhitespace(content: string): string {
  return decodeHtmlEntities(content)
    .replace(/\r\n/g, "\n")
    .replace(/\u2022/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSummaryFromText(content: string): string | null {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }

  const sentenceMatch = compact.match(/^(.{1,240}?[.!?])(?:\s|$)/);
  if (sentenceMatch?.[1]) {
    return cleanOverviewText(sentenceMatch[1].trim());
  }

  if (compact.length <= 240) {
    return cleanOverviewText(compact);
  }

  return cleanOverviewText(`${compact.slice(0, 237).trimEnd()}...`);
}

function stripHtml(content: string): string {
  return content
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function extractEmailAddress(value: string): string {
  const normalized = tryNormalizeEmailAddress(value);
  if (!normalized) {
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

function normalizeRecipientList(value: unknown): string[] {
  const fromStrings = toStringArray(value);
  if (fromStrings.length > 0) {
    return fromStrings
      .flatMap((entry) => splitEmails(entry))
      .filter(Boolean);
  }
  const fromObjects = extractRecipientEmails(value);
  if (fromObjects.length > 0) {
    return fromObjects;
  }
  if (typeof value === "string") {
    return splitEmails(value);
  }
  return [];
}

function extractSection(content: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const allLabels = SECTION_LABELS.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(?:^|\\n)\\s*${escaped}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${allLabels}):|$)`, "i");
  const match = content.match(regex);
  return match?.[1]?.trim() ?? "";
}

function normalizeSectionHeadings(content: string): string {
  const labels = SECTION_LABELS.map((label) => ({
    label,
    escaped: label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  }));

  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      for (const { label, escaped } of labels) {
        const headingPattern = new RegExp(`^(?:>\\s*)?(?:#{1,6}\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:?\\s*$`, "i");
        if (headingPattern.test(trimmed)) {
          return `${label}:`;
        }
      }
      return line;
    })
    .join("\n");
}

function toBulletList(content: string): string[] {
  return content
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*[-*+]\s+\[(?: |x|X)\]\s*/, "")
        .replace(/^\s*[-*+]\s*/, "")
        .replace(/^\s*\d+[.)]\s*/, "")
        .trim(),
    )
    .filter(Boolean);
}

function normalizeProjectStatus(content: string): ProjectStatus | null {
  const match = firstMeaningfulLine(content).match(/\b(active|paused|completed)\b/i);
  if (!match?.[1]) {
    return null;
  }
  return match[1].toLowerCase() as ProjectStatus;
}

function dedupeListValues(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const key = normalizeForDedup(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value.trim());
  }
  return output;
}

function parseTransactionBlock(content: string): TransactionEvent | null {
  if (!content.trim()) {
    return null;
  }

  const valueByLabel = (labels: string[]): number => {
    const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const match = content.match(new RegExp(`(?:^|\\n)(?:${escapedLabels})\\s*:\\s*\\$?\\s*([\\d.]+)`, "i"));
    return Number(match?.[1] ?? 0);
  };

  const hours = valueByLabel(["Hours Purchased", "Hours"]);
  const rate = valueByLabel(["Hourly Rate", "Rate"]);

  const event: TransactionEvent = {
    hoursPurchased: hours,
    hourlyRate: rate,
    allocatedHours: valueByLabel(["Allocated to Freelancer"]),
    bufferHours: valueByLabel(["Buffer"]),
    saas2Fee: valueByLabel(["SaaS2 Fee", "SaaS² Fee"]),
    projectRemainder: valueByLabel(["Project Remainder"]) || 0,
  };

  if (event.hoursPurchased <= 0 || event.hourlyRate <= 0) {
    return null;
  }

  return event;
}

function parseApprovals(content: string): Array<{ suggestionId: string; decision: "approve" | "reject" }> {
  const approvals: Array<{ suggestionId: string; decision: "approve" | "reject" }> = [];
  const approveRegex = /approve suggestion\s+([a-z0-9-]{1,64})/gi;
  for (const match of content.matchAll(approveRegex)) {
    approvals.push({ suggestionId: match[1], decision: "approve" });
  }
  const rejectRegex = /reject suggestion\s+([a-z0-9-]{1,64})/gi;
  for (const match of content.matchAll(rejectRegex)) {
    approvals.push({ suggestionId: match[1], decision: "reject" });
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

function firstMeaningfulLine(content: string): string {
  const lines = content
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*[-*+]\s+/, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        .trim(),
    )
    .filter(Boolean);

  return lines[0] ?? "";
}

function parseProjectNameUpdate(content: string, normalizedContent: string): string | null {
  const fromSection = extractSection(normalizedContent, "Project Name");
  const sectionCandidate = normalizeProjectNameCandidate(firstMeaningfulLine(fromSection));
  if (sectionCandidate) {
    return sectionCandidate;
  }

  const renameMatch = content.match(/(?:^|\n)\s*rename\s+project\s+to\s*:\s*(.+)$/im);
  if (renameMatch?.[1]) {
    return normalizeProjectNameCandidate(renameMatch[1]);
  }

  return null;
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

type ParsedInboundAttachment = {
  filename: string | null;
  contentType: string | null;
  isPdf: boolean;
};

function attachmentFilename(value: Record<string, unknown>): string | null {
  return (
    toStringOrNull(value.filename) ||
    toStringOrNull(value.fileName) ||
    toStringOrNull(value.name) ||
    toStringOrNull(value.originalFilename) ||
    toStringOrNull(value.original_filename)
  );
}

function attachmentContentType(value: Record<string, unknown>): string | null {
  return (
    toStringOrNull(value.contentType) ||
    toStringOrNull(value.content_type) ||
    toStringOrNull(value.mimeType) ||
    toStringOrNull(value.mime_type) ||
    toStringOrNull(value.type)
  );
}

function isPdfAttachment(filename: string | null, contentType: string | null): boolean {
  if (filename?.toLowerCase().endsWith(".pdf")) {
    return true;
  }
  if (contentType?.toLowerCase().includes("application/pdf")) {
    return true;
  }
  return false;
}

function parseAttachmentCandidate(value: unknown): ParsedInboundAttachment | null {
  if (typeof value === "string") {
    const filename = toStringOrNull(value);
    if (!filename) {
      return null;
    }
    return {
      filename,
      contentType: null,
      isPdf: isPdfAttachment(filename, null),
    };
  }

  const objectValue = toObjectOrNull(value);
  if (!objectValue) {
    return null;
  }

  const filename = attachmentFilename(objectValue);
  const contentType = attachmentContentType(objectValue);
  if (!filename && !contentType) {
    return null;
  }

  return {
    filename,
    contentType,
    isPdf: isPdfAttachment(filename, contentType),
  };
}

function extractInboundAttachments(root: Record<string, unknown>, source: Record<string, unknown>): ParsedInboundAttachment[] {
  const candidateCollections = [root.attachments, source.attachments, root.files, source.files, root.data, source.data];
  const parsedAttachments: ParsedInboundAttachment[] = [];
  const seen = new Set<string>();

  for (const candidate of candidateCollections) {
    const objectCandidate = toObjectOrNull(candidate);
    if (objectCandidate) {
      const nestedArrayCandidate = objectCandidate.attachments ?? objectCandidate.files;
      if (Array.isArray(nestedArrayCandidate)) {
        for (const attachmentCandidate of nestedArrayCandidate) {
          const parsed = parseAttachmentCandidate(attachmentCandidate);
          if (!parsed) {
            continue;
          }
          const key = `${parsed.filename ?? ""}|${parsed.contentType ?? ""}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          parsedAttachments.push(parsed);
        }
      }
      continue;
    }

    if (!Array.isArray(candidate)) {
      continue;
    }
    for (const attachmentCandidate of candidate) {
      const parsed = parseAttachmentCandidate(attachmentCandidate);
      if (!parsed) {
        continue;
      }
      const key = `${parsed.filename ?? ""}|${parsed.contentType ?? ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      parsedAttachments.push(parsed);
    }
  }

  return parsedAttachments;
}

export function parseNormalizedContent(content: string) {
  const normalizedContent = normalizeSectionHeadings(content);
  const projectStatus = normalizeProjectStatus(
    extractSection(normalizedContent, "Project Status") || extractSection(normalizedContent, "Status"),
  );
  const goals = dedupeListValues(toBulletList(extractSection(normalizedContent, "Goals")));
  const actionItems = dedupeListValues(toBulletList(extractSection(normalizedContent, "Tasks")));
  const completedTasks = dedupeListValues(toBulletList(extractSection(normalizedContent, "Completed")));
  const decisions = dedupeListValues(toBulletList(extractSection(normalizedContent, "Decisions")));
  const risks = dedupeListValues(toBulletList(extractSection(normalizedContent, "Risks")));
  const notesSection = filterIgnoredNoteLines(dedupeListValues(toBulletList(extractSection(normalizedContent, "Notes"))));
  const userProfileContext = extractSection(normalizedContent, "UserProfile") || extractSection(normalizedContent, "Context");
  const rpmSuggestionContent = extractSection(normalizedContent, "UserProfile Suggestion");
  const transactionEvent = parseTransactionBlock(extractSection(normalizedContent, "Transaction"));
  const approvals = parseApprovals(content);
  const additionalEmails = parseAdditionalEmails(normalizedContent);
  const projectName = parseProjectNameUpdate(content, normalizedContent);

  const hasMeaning =
    Boolean(projectStatus) ||
    goals.length > 0 ||
    actionItems.length > 0 ||
    completedTasks.length > 0 ||
    decisions.length > 0 ||
    risks.length > 0 ||
    notesSection.length > 0 ||
    Boolean(userProfileContext) ||
    Boolean(rpmSuggestionContent) ||
    Boolean(transactionEvent) ||
    approvals.length > 0;

  const normalizedSummary = !hasMeaning ? extractSummaryFromText(content) : null;
  let notes: string[];
  if (hasMeaning) {
    notes = notesSection;
  } else if (isIgnoredNoteInput(content)) {
    notes = [];
  } else {
    notes = [content];
  }
  if (hasMeaning && normalizedSummary) {
    const summaryKey = normalizeForDedup(normalizedSummary);
    notes = notes.filter((entry) => normalizeForDedup(entry) !== summaryKey);
  }
  notes = filterIgnoredNoteLines(notes);

  return {
    summary: normalizedSummary || null,
    currentStatus: null,
    projectStatus,
    goals,
    actionItems,
    completedTasks,
    decisions,
    risks,
    recommendations: [],
    notes,
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
    projectName,
  };
}

/**
 * Extract project routing token from subject, e.g. [PJT-A1B2C3D4] → pjt-a1b2c3d4 (DB form).
 */
export function parseProjectCodeFromSubject(subject: string): string | null {
  const m = subject.match(/\[PJT-([A-F0-9]{6,10})\]/i);
  if (!m?.[1]) {
    return null;
  }
  return `pjt-${m[1].toLowerCase()}`;
}

function extractInReplyToRaw(source: Record<string, unknown>): string {
  const candidates = [
    toStringOrEmpty(source["In-Reply-To"]),
    toStringOrEmpty(source["in-reply-to"]),
    nestedString(source, ["headers", "In-Reply-To"]),
    nestedString(source, ["headers", "in-reply-to"]),
  ];
  for (const c of candidates) {
    if (c.trim()) {
      return c;
    }
  }
  return "";
}

function extractReferencesRaw(source: Record<string, unknown>): string {
  return (
    toStringOrEmpty(source.References) ||
    toStringOrEmpty(source.references) ||
    nestedString(source, ["headers", "References"]) ||
    nestedString(source, ["headers", "references"]) ||
    ""
  );
}

function parseReferencesList(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }
  const ids = raw
    .split(/\s+/)
    .map((segment) => normalizeMessageId(segment))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function stableProviderEventId(provider: string, from: string, subject: string, body: string): string {
  const hash = createHash("sha256")
    .update(`${provider}\n${from}\n${subject}\n${body}`)
    .digest("hex");
  return `generated-${hash.slice(0, 32)}`;
}

function parseIsoTimestamp(value: string): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function extractEventTimestamp(root: Record<string, unknown>, source: Record<string, unknown>): string {
  const timestampCandidates = [
    toStringOrEmpty(root.created_at),
    toStringOrEmpty(root.createdAt),
    toStringOrEmpty(root.timestamp),
    toStringOrEmpty(source.created_at),
    toStringOrEmpty(source.createdAt),
    toStringOrEmpty(source.timestamp),
    toStringOrEmpty(source.date),
    nestedString(root, ["data", "created_at"]),
    nestedString(source, ["headers", "date"]),
  ];
  for (const candidate of timestampCandidates) {
    const iso = parseIsoTimestamp(candidate);
    if (iso) {
      return iso;
    }
  }
  return new Date().toISOString();
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
    toStringOrEmpty(source.email_id);

  if (!senderRaw) {
    throw new InboundParseError("Inbound payload is missing sender email.");
  }

  const senderEmail = extractEmailAddress(senderRaw);
  const fromDisplayName = extractDisplayNameFromSenderRaw(senderRaw, senderEmail);
  const rawBody = extractBodyContent(source);
  if (!rawBody) {
    throw new InboundParseError("Inbound payload is missing email body content.");
  }

  const cleanedBody = normalizeWhitespace(stripQuotedReply(rawBody));
  const to = normalizeRecipientList(source.to);
  const cc = normalizeRecipientList(source.cc);
  const timestamp = extractEventTimestamp(root, source);
  const providerEventId = messageId || stableProviderEventId(provider, senderEmail, subject, cleanedBody);
  const parsed = parseNormalizedContent(cleanedBody);
  const attachments = extractInboundAttachments(root, source);

  if (parsed.rpmSuggestion) {
    parsed.rpmSuggestion.from = senderEmail;
    parsed.rpmSuggestion.timestamp = timestamp;
  }

  const inReplyToRaw = extractInReplyToRaw(source);
  const inReplyTo = inReplyToRaw.trim() ? normalizeMessageId(inReplyToRaw) : null;
  const references = parseReferencesList(extractReferencesRaw(source));

  return {
    eventId: crypto.randomUUID(),
    provider,
    providerEventId,
    timestamp,
    from: senderEmail,
    fromDisplayName,
    to,
    cc,
    subject,
    inReplyTo,
    references,
    attachments,
    rawBody: cleanedBody,
    parsed,
  };
}
