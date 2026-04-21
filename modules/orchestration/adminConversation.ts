import type { Tier } from "@/modules/contracts/types";
import { tryNormalizeEmailAddress } from "@/modules/email/emailAddress";

export type AdminActionKind = "update_tier" | "assign_rpm";

export type AdminActionPayload =
  | {
      kind: "update_tier";
      userEmail: string;
      tier: Tier;
    }
  | {
      kind: "assign_rpm";
      userEmail: string;
      rpmEmail: string;
    };

export type AdminRequest =
  | { kind: "menu" }
  | { kind: "confirm" }
  | { kind: "show_users" }
  | { kind: "show_projects"; userEmail: string | null }
  | { kind: "show_transactions"; userEmail: string | null }
  | { kind: "show_rpm"; userEmail: string | null }
  | { kind: "update_tier"; userEmail: string | null; tier: Tier | null }
  | { kind: "assign_rpm"; userEmail: string | null; rpmEmail: string | null };

export interface AdminReply {
  subject: string;
  text: string;
  html: string;
}

const ADMIN_PREFIX_RE = /^\s*admin(?:\s+menu)?\s*[:,-]?\s*/i;

function buildReplySubject(originalSubject: string): string {
  return originalSubject.match(/^re:/i) ? originalSubject : `Re: ${originalSubject}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeBody(body: string): string {
  return body.trim().replace(/\s+/g, " ");
}

function stripAdminPrefix(body: string): { text: string; hadPrefix: boolean } {
  const hadPrefix = ADMIN_PREFIX_RE.test(body);
  if (!hadPrefix) {
    return { text: normalizeBody(body), hadPrefix: false };
  }
  return {
    text: normalizeBody(body.replace(ADMIN_PREFIX_RE, "")),
    hadPrefix: true,
  };
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[^\s<>()"']+@[^\s<>()"']+\.[^\s<>()"']+/g) ?? [];
  const emails: string[] = [];
  for (const match of matches) {
    const normalized = tryNormalizeEmailAddress(match);
    if (normalized && !emails.includes(normalized)) {
      emails.push(normalized);
    }
  }
  return emails;
}

function extractTier(text: string): Tier | null {
  const match = text.match(/\b(agency|solopreneur|freemium)\b/i);
  return (match?.[1]?.toLowerCase() as Tier | undefined) ?? null;
}

function renderListHtml(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  return `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
}

export function parseAdminRequest(rawBody: string): AdminRequest | null {
  const body = rawBody.trim();
  if (!body) {
    return null;
  }

  if (/^confirm[.!?\s]*$/i.test(body)) {
    return { kind: "confirm" };
  }

  const { text: strippedBody, hadPrefix } = stripAdminPrefix(body);
  const candidate = strippedBody || normalizeBody(body);
  const lower = candidate.toLowerCase();

  if (hadPrefix && !candidate) {
    return { kind: "menu" };
  }

  if (lower === "admin" || lower === "admin menu" || lower === "menu") {
    return { kind: "menu" };
  }

  if (/(?:show|list|view)\s+(?:all\s+)?users?\b/i.test(candidate)) {
    return { kind: "show_users" };
  }

  if (/(?:show|list|view)\s+(?:all\s+)?projects?\b/i.test(candidate) || /\bprojects?\s+for\b/i.test(candidate)) {
    const emails = extractEmails(candidate);
    return { kind: "show_projects", userEmail: emails[0] ?? null };
  }

  if (
    /(?:show|list|view)\s+(?:all\s+)?transactions?\b/i.test(candidate) ||
    /\btransactions?\s+for\b/i.test(candidate)
  ) {
    const emails = extractEmails(candidate);
    return { kind: "show_transactions", userEmail: emails[0] ?? null };
  }

  if (/(?:what|show|view)\s+(?:the\s+)?rpm\b/i.test(candidate) || /\brpm\s+for\b/i.test(candidate)) {
    const emails = extractEmails(candidate);
    return { kind: "show_rpm", userEmail: emails[0] ?? null };
  }

  if (/\bassign\b/i.test(candidate) || (/\b(set|change)\b/i.test(candidate) && /\brpm\b/i.test(candidate))) {
    const emails = extractEmails(candidate);
    return {
      kind: "assign_rpm",
      userEmail: emails[0] ?? null,
      rpmEmail: emails[1] ?? null,
    };
  }

  if (/\b(make|set|update|upgrade)\b/i.test(candidate) && /\b(agency|solopreneur|freemium)\b/i.test(candidate)) {
    const emails = extractEmails(candidate);
    return {
      kind: "update_tier",
      userEmail: emails[0] ?? null,
      tier: extractTier(candidate),
    };
  }

  if (hadPrefix) {
    return { kind: "menu" };
  }

  return null;
}

export function isAdminRequest(rawBody: string): boolean {
  return parseAdminRequest(rawBody) !== null;
}

export function buildAdminMenuReply(originalSubject: string): AdminReply {
  return {
    subject: buildReplySubject(originalSubject),
    text: [
      "Admin Menu",
      "",
      "You can ask me to do things like:",
      "",
      "1. View all users",
      '→ "Show me all users"',
      "",
      "2. Update a user's tier",
      '→ "Make user@email.com an agency"',
      "",
      "3. Assign an RPM",
      '→ "Assign user@email.com to john@company.com"',
      "",
      "4. View user projects",
      '→ "Show projects for user@email.com"',
      "",
      "5. View transactions",
      '→ "Show transactions for user@email.com"',
      "",
      "Just reply naturally with what you want to do.",
      "",
      "— Frank",
    ].join("\n"),
    html: [
      "<p><strong>Admin Menu</strong></p>",
      "<p>You can ask me to do things like:</p>",
      "<ol>",
      "<li>View all users<br>&rarr; &quot;Show me all users&quot;</li>",
      "<li>Update a user's tier<br>&rarr; &quot;Make user@email.com an agency&quot;</li>",
      "<li>Assign an RPM<br>&rarr; &quot;Assign user@email.com to john@company.com&quot;</li>",
      "<li>View user projects<br>&rarr; &quot;Show projects for user@email.com&quot;</li>",
      "<li>View transactions<br>&rarr; &quot;Show transactions for user@email.com&quot;</li>",
      "</ol>",
      "<p>Just reply naturally with what you want to do.</p>",
      "<p>&mdash; Frank</p>",
    ].join(""),
  };
}

export function buildAdminNoPendingReply(originalSubject: string): AdminReply {
  return {
    subject: buildReplySubject(originalSubject),
    text: [
      "I couldn’t find a pending admin action to confirm.",
      "",
      "Send a new admin command or reply with Admin to see the menu again.",
      "",
      "— Frank",
    ].join("\n"),
    html: [
      "<p>I couldn&rsquo;t find a pending admin action to confirm.</p>",
      "<p>Send a new admin command or reply with <strong>Admin</strong> to see the menu again.</p>",
      "<p>&mdash; Frank</p>",
    ].join(""),
  };
}

export function buildAdminConfirmationReply(originalSubject: string, payload: AdminActionPayload): AdminReply {
  const commonText = (() => {
    if (payload.kind === "update_tier") {
      const label = payload.tier[0].toUpperCase() + payload.tier.slice(1);
      return [
        "I understood:",
        "",
        "Update user tier",
        `User: ${payload.userEmail}`,
        `New Tier: ${label}`,
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    return [
      "I understood:",
      "",
      "Assign RPM",
      `User: ${payload.userEmail}`,
      `RPM: ${payload.rpmEmail}`,
      "",
      'Reply "CONFIRM" to proceed.',
      "",
      "— Frank",
    ].join("\n");
  })();

  const html =
    payload.kind === "update_tier"
      ? [
          "<p>I understood:</p>",
          "<p><strong>Update user tier</strong><br>",
          `User: ${escapeHtml(payload.userEmail)}<br>`,
          `New Tier: ${escapeHtml(payload.tier[0].toUpperCase() + payload.tier.slice(1))}</p>`,
          '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
          "<p>&mdash; Frank</p>",
        ].join("")
      : [
          "<p>I understood:</p>",
          "<p><strong>Assign RPM</strong><br>",
          `User: ${escapeHtml(payload.userEmail)}<br>`,
          `RPM: ${escapeHtml(payload.rpmEmail)}</p>`,
          '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
          "<p>&mdash; Frank</p>",
        ].join("");

  return {
    subject: buildReplySubject(originalSubject),
    text: commonText,
    html,
  };
}

export function buildAdminResultReply(
  originalSubject: string,
  heading: string,
  lines: string[],
  nextSteps: string[] = [],
): AdminReply {
  const text = [
    `${heading}:`,
    "",
    ...lines,
    ...(nextSteps.length > 0 ? ["", "Next:", ...nextSteps] : []),
    "",
    "— Frank",
  ].join("\n");

  const html = [
    `<p><strong>${escapeHtml(heading)}:</strong></p>`,
    renderListHtml(lines),
    nextSteps.length > 0
      ? `<p><strong>Next:</strong></p>${renderListHtml(nextSteps)}`
      : "",
    "<p>&mdash; Frank</p>",
  ].join("");

  return {
    subject: buildReplySubject(originalSubject),
    text,
    html,
  };
}

export function buildAdminClarificationReply(originalSubject: string, message: string): AdminReply {
  return {
    subject: buildReplySubject(originalSubject),
    text: [
      message,
      "",
      "Try one of these examples:",
      '- "Show me all users"',
      '- "Show projects for user@email.com"',
      '- "Make user@email.com an agency"',
      '- "Assign user@email.com to john@company.com"',
      "",
      "— Frank",
    ].join("\n"),
    html: [
      `<p>${escapeHtml(message)}</p>`,
      "<p>Try one of these examples:</p>",
      "<ul>",
      "<li>Show me all users</li>",
      "<li>Show projects for user@email.com</li>",
      "<li>Make user@email.com an agency</li>",
      "<li>Assign user@email.com to john@company.com</li>",
      "</ul>",
      "<p>&mdash; Frank</p>",
    ].join(""),
  };
}

export function buildAdminMenuOrResultReply(originalSubject: string, rawBody: string): AdminReply | null {
  const request = parseAdminRequest(rawBody);
  if (!request) {
    return null;
  }

  if (request.kind === "menu") {
    return buildAdminMenuReply(originalSubject);
  }

  return null;
}

export function formatAdminUserRows(rows: Array<{ email: string; tier: Tier }>): string[] {
  if (rows.length === 0) {
    return ["No users found."];
  }
  return rows.map((row) => `${row.email} (${row.tier[0].toUpperCase()}${row.tier.slice(1)})`);
}

export function formatAdminProjectRows(
  rows: Array<{ name: string; code: string; status: string; rpmEmail: string | null }>,
): string[] {
  if (rows.length === 0) {
    return ["No projects found for that user."];
  }
  return rows.map((row) => {
    const rpm = row.rpmEmail ? `RPM: ${row.rpmEmail}` : "RPM: none";
    return `${row.name} [${row.code}] (${row.status}) - ${rpm}`;
  });
}

export function formatAdminTransactionRows(
  rows: Array<{ projectName: string; hours: number; rate: number; status: string; createdAt: string }>,
): string[] {
  if (rows.length === 0) {
    return ["No transactions found for that user."];
  }
  return rows.map((row) => {
    const timestamp = new Date(row.createdAt).toISOString().slice(0, 10);
    return `${timestamp} - ${row.projectName}: ${row.hours}h @ ${row.rate} (${row.status})`;
  });
}

export function formatAdminRpmRows(rows: Array<{ projectName: string; rpmEmail: string | null }>): string[] {
  if (rows.length === 0) {
    return ["No projects found for that user."];
  }
  return rows.map((row) => `${row.projectName}: ${row.rpmEmail ?? "none"}`);
}

export function buildAdminActionConfirmation(
  originalSubject: string,
  action: AdminActionPayload,
): AdminReply {
  return buildAdminConfirmationReply(originalSubject, action);
}

export function summarizeAdminAction(action: AdminActionPayload): string {
  if (action.kind === "update_tier") {
    return `Update user tier for ${action.userEmail} to ${action.tier}`;
  }
  return `Assign RPM ${action.rpmEmail} to ${action.userEmail}`;
}

