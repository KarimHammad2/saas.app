import type { Tier } from "@/modules/contracts/types";
import { tryNormalizeEmailAddress } from "@/modules/email/emailAddress";

export type AdminActionKind =
  | "update_tier"
  | "assign_rpm"
  | "remove_rpm"
  | "edit_project_field"
  | "archive_project"
  | "restore_project"
  | "delete_project"
  | "create_user"
  | "create_project"
  | "upsert_instruction"
  | "upsert_email_template"
  | "upsert_system_setting";

/** Scalar project-memory fields admins can edit through the pending-confirmation flow. */
export type AdminEditableProjectField =
  | "summary"
  | "current_status"
  | "goals"
  | "action_items"
  | "risks"
  | "notes";

/** email_template columns admins can overwrite (all three optional to support partial edits). */
export interface AdminEmailTemplatePatch {
  subject?: string;
  textBody?: string;
  htmlBody?: string;
}

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
      projectName: string;
    }
  | {
      kind: "remove_rpm";
      userEmail: string;
      projectName: string;
    }
  | {
      kind: "edit_project_field";
      projectName: string;
      userEmail: string | null;
      field: AdminEditableProjectField;
      value: string;
    }
  | {
      kind: "archive_project";
      projectName: string;
      userEmail: string | null;
    }
  | {
      kind: "restore_project";
      projectName: string;
      userEmail: string | null;
    }
  | {
      kind: "delete_project";
      projectName: string;
      userEmail: string | null;
    }
  | {
      kind: "create_user";
      userEmail: string;
    }
  | {
      kind: "create_project";
      projectName: string;
      userEmail: string;
    }
  | {
      kind: "upsert_instruction";
      key: string;
      content: string;
    }
  | {
      kind: "upsert_email_template";
      key: string;
      patch: AdminEmailTemplatePatch;
    }
  | {
      kind: "upsert_system_setting";
      key: string;
      valueJson: unknown;
    };

export type AdminRequest =
  | { kind: "menu" }
  | { kind: "confirm" }
  | { kind: "show_users" }
  | { kind: "show_projects"; userEmail: string | null }
  | { kind: "show_transactions"; userEmail: string | null }
  | { kind: "show_rpm"; userEmail: string | null }
  | { kind: "show_updates"; projectName: string | null; userEmail: string | null }
  | {
      kind: "show_project_state";
      projectName: string | null;
      userEmail: string | null;
      sections: AdminEditableProjectField[] | null;
    }
  | { kind: "show_documents"; projectName: string | null; userEmail: string | null }
  | { kind: "show_settings"; keyPrefix: string | null }
  | { kind: "show_templates"; key: string | null }
  | { kind: "show_instructions"; key: string | null }
  | { kind: "update_tier"; userEmail: string | null; tier: Tier | null }
  | { kind: "assign_rpm"; userEmail: string | null; rpmEmail: string | null; projectName: string | null }
  | { kind: "remove_rpm"; userEmail: string | null; projectName: string | null }
  | {
      kind: "edit_project_field";
      projectName: string | null;
      userEmail: string | null;
      field: AdminEditableProjectField | null;
      value: string | null;
    }
  | { kind: "archive_project"; projectName: string | null; userEmail: string | null }
  | { kind: "restore_project"; projectName: string | null; userEmail: string | null }
  | { kind: "delete_project"; projectName: string | null; userEmail: string | null }
  | { kind: "create_user"; userEmail: string | null }
  | { kind: "create_project"; projectName: string | null; userEmail: string | null }
  | { kind: "upsert_instruction"; key: string | null; content: string | null }
  | {
      kind: "upsert_email_template";
      key: string | null;
      field: "subject" | "text" | "html" | null;
      value: string | null;
    }
  | { kind: "upsert_system_setting"; key: string | null; rawValue: string | null };

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

function stripTrailingPunctuation(value: string): string {
  return value
    .replace(/^["'“”‘’]+/, "")
    .replace(/["'“”‘’।,!?.]+$/, "")
    .trim();
}

function extractProjectName(text: string): string | null {
  const withoutCodeToken = text.replace(/\[PJT-[A-F0-9]{6,10}\]/gi, " ").replace(/\s+/g, " ").trim();
  const match = withoutCodeToken.match(/\bproject(?:\s+name)?\b(?:\s*(?:is|:|-)\s*|\s+)(.+)$/i);
  if (!match?.[1]) {
    return null;
  }
  // Strip trailing clauses that belong to the surrounding command rather than the name,
  // e.g. " for owner@email.com", " to <new value>", " owned by owner@email.com".
  let candidate = match[1].trim();
  candidate = candidate.replace(
    /\s+(?:for|owned\s+by|of)\s+[^\s<>()"']+@[^\s<>()"']+\.[^\s<>()"']+.*$/i,
    "",
  );
  candidate = candidate.replace(/\s+to\s*[:=]?\s+.+$/i, "");
  return stripTrailingPunctuation(candidate.trim()) || null;
}

function extractQuotedValue(text: string): string | null {
  const double = text.match(/"([^"]+)"/);
  if (double?.[1]) {
    return double[1].trim() || null;
  }
  const single = text.match(/'([^']+)'/);
  if (single?.[1]) {
    return single[1].trim() || null;
  }
  return null;
}

function extractValueAfterTo(text: string): string | null {
  const match = text.match(/\bto\s*[:=]?\s*(.+)$/i);
  if (!match?.[1]) {
    return null;
  }
  return stripTrailingPunctuation(match[1].trim()) || null;
}

function extractForUserEmail(text: string): string | null {
  const match = text.match(/\b(?:for|owned\s+by|of)\s+([^\s<>()"']+@[^\s<>()"']+\.[^\s<>()"']+)/i);
  if (!match?.[1]) {
    return null;
  }
  const normalized = tryNormalizeEmailAddress(match[1]);
  return normalized ?? null;
}

function extractTier(text: string): Tier | null {
  const match = text.match(/\b(agency|solopreneur|freemium)\b/i);
  return (match?.[1]?.toLowerCase() as Tier | undefined) ?? null;
}

const PROJECT_STATE_SECTION_WORDS: Array<{ pattern: RegExp; field: AdminEditableProjectField }> = [
  { pattern: /\bgoals?\b/i, field: "goals" },
  { pattern: /\b(?:tasks?|action\s*items?)\b/i, field: "action_items" },
  { pattern: /\brisks?\b/i, field: "risks" },
  { pattern: /\bnotes?\b/i, field: "notes" },
  { pattern: /\b(?:current\s*status|status)\b/i, field: "current_status" },
  { pattern: /\b(?:summary|overview)\b/i, field: "summary" },
];

function extractProjectStateSections(text: string): AdminEditableProjectField[] {
  const out: AdminEditableProjectField[] = [];
  for (const { pattern, field } of PROJECT_STATE_SECTION_WORDS) {
    if (pattern.test(text) && !out.includes(field)) {
      out.push(field);
    }
  }
  return out;
}

function extractProjectFieldTarget(text: string): AdminEditableProjectField | null {
  for (const { pattern, field } of PROJECT_STATE_SECTION_WORDS) {
    if (pattern.test(text)) {
      return field;
    }
  }
  return null;
}

function extractKeyToken(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\s+([A-Za-z0-9_.-]+)`, "i");
  const match = text.match(re);
  if (!match?.[1]) {
    return null;
  }
  return match[1].trim() || null;
}

function extractEmailTemplateField(text: string): "subject" | "text" | "html" | null {
  if (/\bsubject\b/i.test(text)) {
    return "subject";
  }
  if (/\b(?:html|html\s*body)\b/i.test(text)) {
    return "html";
  }
  if (/\b(?:text|body|text\s*body)\b/i.test(text)) {
    return "text";
  }
  return null;
}

function renderListHtml(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  return `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
}

function renderGroupedListHtml(groups: Array<{ heading: string; items: string[] }>): string {
  return groups
    .map((group) => {
      if (group.items.length === 0) {
        return "";
      }
      return `<p><strong>${escapeHtml(group.heading)}</strong></p>${renderListHtml(group.items)}`;
    })
    .join("");
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

  if (/(?:show|list|view)\b(?:\s+\w+)*?\s+users?\b/i.test(candidate)) {
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

  if (/(?:show|list|view)\s+(?:all\s+)?(?:project\s+)?updates?\b/i.test(candidate)) {
    return {
      kind: "show_updates",
      projectName: extractProjectName(candidate),
      userEmail: extractForUserEmail(candidate),
    };
  }

  if (/(?:show|list|view)\s+(?:all\s+)?(?:project\s+)?documents?\b/i.test(candidate)) {
    return {
      kind: "show_documents",
      projectName: extractProjectName(candidate),
      userEmail: extractForUserEmail(candidate),
    };
  }

  if (/(?:show|list|view)\s+(?:all\s+)?(?:system\s+)?settings?\b/i.test(candidate)) {
    const quoted = extractQuotedValue(candidate);
    const explicit = candidate.match(/\bsettings?\s+(?:starting\s+with\s+)?([A-Za-z0-9_.*-]+)/i);
    const prefix = quoted ?? (explicit?.[1]?.trim() || null);
    return { kind: "show_settings", keyPrefix: prefix && prefix !== "*" ? prefix.replace(/\*$/, "") : null };
  }

  if (/(?:show|list|view)\s+(?:all\s+)?(?:email\s+)?templates?\b/i.test(candidate)) {
    const key = extractKeyToken(candidate, "template");
    return { kind: "show_templates", key };
  }

  if (/(?:show|list|view)\s+(?:all\s+)?instructions?\b/i.test(candidate)) {
    const key = extractKeyToken(candidate, "instruction");
    return { kind: "show_instructions", key };
  }

  // Project state read (goals/tasks/risks/notes/status/summary for <project>)
  if (
    /\b(?:show|list|view)\b/i.test(candidate) &&
    /\b(?:goals?|tasks?|action\s*items?|risks?|notes?|status|current\s*status|summary|overview)\b/i.test(candidate) &&
    /\bfor\b/i.test(candidate) &&
    /\bproject\b/i.test(candidate)
  ) {
    const sections = extractProjectStateSections(candidate);
    return {
      kind: "show_project_state",
      projectName: extractProjectName(candidate),
      userEmail: extractForUserEmail(candidate),
      sections: sections.length > 0 ? sections : null,
    };
  }

  if (/\bcreate\s+user\b/i.test(candidate)) {
    const emails = extractEmails(candidate);
    return { kind: "create_user", userEmail: emails[0] ?? null };
  }

  if (/\bcreate\s+project\b/i.test(candidate)) {
    return {
      kind: "create_project",
      projectName: extractProjectName(candidate),
      userEmail: extractForUserEmail(candidate),
    };
  }

  if (/\bdelete\s+project\b/i.test(candidate)) {
    return {
      kind: "delete_project",
      projectName: extractProjectName(candidate),
      userEmail: extractForUserEmail(candidate),
    };
  }

  if (/\barchive\s+project\b/i.test(candidate)) {
    return {
      kind: "archive_project",
      projectName: extractProjectName(candidate),
      userEmail: extractForUserEmail(candidate),
    };
  }

  if (/\brestore\s+project\b/i.test(candidate)) {
    return {
      kind: "restore_project",
      projectName: extractProjectName(candidate),
      userEmail: extractForUserEmail(candidate),
    };
  }

  // "Set goals|tasks|risks|notes|summary|status for project <name> to <value>"
  if (
    /\b(?:set|update|change|edit)\b/i.test(candidate) &&
    /\b(?:goals?|tasks?|action\s*items?|risks?|notes?|status|current\s*status|summary|overview)\b/i.test(candidate) &&
    /\bproject\b/i.test(candidate) &&
    /\bto\b/i.test(candidate)
  ) {
    return {
      kind: "edit_project_field",
      projectName: extractProjectName(candidate),
      userEmail: extractForUserEmail(candidate),
      field: extractProjectFieldTarget(candidate),
      value: extractValueAfterTo(candidate),
    };
  }

  // "Set instruction <key> to <value>" / "Update instruction <key> to <value>"
  if (/\b(?:set|update|change|edit)\b/i.test(candidate) && /\binstruction\b/i.test(candidate) && /\bto\b/i.test(candidate)) {
    return {
      kind: "upsert_instruction",
      key: extractKeyToken(candidate, "instruction"),
      content: extractValueAfterTo(candidate),
    };
  }

  // "Update template <key> subject|text|html to <value>"
  if (/\b(?:set|update|change|edit)\b/i.test(candidate) && /\btemplate\b/i.test(candidate) && /\bto\b/i.test(candidate)) {
    return {
      kind: "upsert_email_template",
      key: extractKeyToken(candidate, "template"),
      field: extractEmailTemplateField(candidate),
      value: extractValueAfterTo(candidate),
    };
  }

  // "Set setting <key> to <value>"
  if (/\b(?:set|update|change|edit)\b/i.test(candidate) && /\bsetting\b/i.test(candidate) && /\bto\b/i.test(candidate)) {
    return {
      kind: "upsert_system_setting",
      key: extractKeyToken(candidate, "setting"),
      rawValue: extractValueAfterTo(candidate),
    };
  }

  if (/\b(remove|unassign|clear)\b/i.test(candidate) && /\brpm\b/i.test(candidate)) {
    const emails = extractEmails(candidate);
    return {
      kind: "remove_rpm",
      userEmail: emails[0] ?? null,
      projectName: extractProjectName(candidate),
    };
  }

  if (/\bassign\b/i.test(candidate) || (/\b(set|change)\b/i.test(candidate) && /\brpm\b/i.test(candidate))) {
    const emails = extractEmails(candidate);
    return {
      kind: "assign_rpm",
      userEmail: emails[0] ?? null,
      rpmEmail: emails[1] ?? null,
      projectName: extractProjectName(candidate),
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

const MENU_VIEW_ITEMS: string[] = [
  'View all users — "Show me all users"',
  'View user projects — "Show projects for user@email.com"',
  'View transactions — "Show transactions for user@email.com"',
  'View project updates — "Show updates for project Alpha Launch"',
  'View project state — "Show goals for project Alpha Launch"',
  'View generated documents — "Show documents for project Alpha Launch"',
  'View system settings — "Show settings email.admin_bcc"',
  'View email templates — "Show template project_update"',
  'View instructions — "Show instruction llm_document_usage"',
];

const MENU_MANAGE_ITEMS: string[] = [
  'Create a user — "Create user alice@example.com"',
  'Create a project — "Create project Alpha Launch for alice@example.com"',
  'Update a user\'s tier — "Make user@email.com an agency"',
  'Assign an RPM — "Assign user@email.com to john@company.com for project Alpha Launch"',
  'Remove an RPM — "Remove the RPM from user@email.com for project Alpha Launch"',
  'Edit a project field — "Set current status for project Alpha Launch to: Design review in progress"',
  'Archive a project — "Archive project Alpha Launch for user@email.com"',
  'Restore a project — "Restore project Alpha Launch for user@email.com"',
  'Delete a project — "Delete project Alpha Launch for user@email.com"',
  'Update an instruction — "Set instruction llm_document_usage to: <content>"',
  'Update an email template — "Update template project_update subject to: <value>"',
  'Update a system setting — "Set setting email.admin_bcc.enabled to true"',
];

export function buildAdminMenuReply(originalSubject: string): AdminReply {
  const text = [
    "Admin Menu",
    "",
    "I can help with the following. For anything that changes data I'll echo what I understood and wait for you to reply CONFIRM.",
    "",
    "— View (read-only) —",
    ...MENU_VIEW_ITEMS.map((item, index) => `${index + 1}. ${item}`),
    "",
    "— Manage (requires CONFIRM) —",
    ...MENU_MANAGE_ITEMS.map((item, index) => `${index + 1 + MENU_VIEW_ITEMS.length}. ${item}`),
    "",
    "Just reply naturally with what you want to do.",
    "",
    "— Frank",
  ].join("\n");

  const html = [
    "<p><strong>Admin Menu</strong></p>",
    "<p>I can help with the following. For anything that changes data I'll echo what I understood and wait for you to reply <strong>CONFIRM</strong>.</p>",
    renderGroupedListHtml([
      { heading: "View (read-only)", items: MENU_VIEW_ITEMS },
      { heading: "Manage (requires CONFIRM)", items: MENU_MANAGE_ITEMS },
    ]),
    "<p>Just reply naturally with what you want to do.</p>",
    "<p>&mdash; Frank</p>",
  ].join("");

  return {
    subject: buildReplySubject(originalSubject),
    text,
    html,
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

function describeEditableField(field: AdminEditableProjectField): string {
  switch (field) {
    case "summary":
      return "Summary";
    case "current_status":
      return "Current Status";
    case "goals":
      return "Goals";
    case "action_items":
      return "Tasks";
    case "risks":
      return "Risks";
    case "notes":
      return "Notes";
  }
}

function describeEmailTemplateField(field: "subject" | "text" | "html"): string {
  return field === "subject" ? "Subject" : field === "html" ? "HTML body" : "Text body";
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

    if (payload.kind === "remove_rpm") {
      return [
        "I understood:",
        "",
        "Remove RPM",
        `User: ${payload.userEmail}`,
        `Project: ${payload.projectName}`,
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    if (payload.kind === "assign_rpm") {
      return [
        "I understood:",
        "",
        "Assign RPM",
        `User: ${payload.userEmail}`,
        `RPM: ${payload.rpmEmail}`,
        `Project: ${payload.projectName}`,
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    if (payload.kind === "edit_project_field") {
      return [
        "I understood:",
        "",
        "Edit project field",
        `Project: ${payload.projectName}`,
        payload.userEmail ? `Owner: ${payload.userEmail}` : "Owner: (first unique match)",
        `Field: ${describeEditableField(payload.field)}`,
        `New value: ${payload.value}`,
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    if (payload.kind === "archive_project" || payload.kind === "restore_project") {
      const heading = payload.kind === "archive_project" ? "Archive project" : "Restore project";
      return [
        "I understood:",
        "",
        heading,
        `Project: ${payload.projectName}`,
        payload.userEmail ? `Owner: ${payload.userEmail}` : "Owner: (first unique match)",
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    if (payload.kind === "delete_project") {
      return [
        "I understood:",
        "",
        "Delete project (permanent)",
        `Project: ${payload.projectName}`,
        payload.userEmail ? `Owner: ${payload.userEmail}` : "Owner: (first unique match)",
        "",
        "This will permanently remove the project and all related updates, transactions, and documents. This cannot be undone.",
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    if (payload.kind === "create_user") {
      return [
        "I understood:",
        "",
        "Create user",
        `User: ${payload.userEmail}`,
        "Tier: Freemium (default)",
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    if (payload.kind === "create_project") {
      return [
        "I understood:",
        "",
        "Create project",
        `Project: ${payload.projectName}`,
        `Owner: ${payload.userEmail}`,
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    if (payload.kind === "upsert_instruction") {
      return [
        "I understood:",
        "",
        "Update instruction",
        `Key: ${payload.key}`,
        `Content: ${payload.content}`,
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    if (payload.kind === "upsert_email_template") {
      const field = payload.patch.subject !== undefined
        ? "subject"
        : payload.patch.htmlBody !== undefined
          ? "html"
          : "text";
      const value = payload.patch.subject ?? payload.patch.htmlBody ?? payload.patch.textBody ?? "";
      return [
        "I understood:",
        "",
        "Update email template",
        `Template: ${payload.key}`,
        `Field: ${describeEmailTemplateField(field)}`,
        `New value: ${value}`,
        "",
        'Reply "CONFIRM" to proceed.',
        "",
        "— Frank",
      ].join("\n");
    }

    // upsert_system_setting
    return [
      "I understood:",
      "",
      "Update system setting",
      `Key: ${payload.key}`,
      `Value: ${JSON.stringify(payload.valueJson)}`,
      "",
      'Reply "CONFIRM" to proceed.',
      "",
      "— Frank",
    ].join("\n");
  })();

  const html = (() => {
    if (payload.kind === "update_tier") {
      return [
        "<p>I understood:</p>",
        "<p><strong>Update user tier</strong><br>",
        `User: ${escapeHtml(payload.userEmail)}<br>`,
        `New Tier: ${escapeHtml(payload.tier[0].toUpperCase() + payload.tier.slice(1))}</p>`,
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    if (payload.kind === "remove_rpm") {
      return [
        "<p>I understood:</p>",
        "<p><strong>Remove RPM</strong><br>",
        `User: ${escapeHtml(payload.userEmail)}<br>`,
        `Project: <strong>${escapeHtml(payload.projectName)}</strong></p>`,
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    if (payload.kind === "assign_rpm") {
      return [
        "<p>I understood:</p>",
        "<p><strong>Assign RPM</strong><br>",
        `User: ${escapeHtml(payload.userEmail)}<br>`,
        `RPM: ${escapeHtml(payload.rpmEmail)}</p>`,
        `<p>Project: <strong>${escapeHtml(payload.projectName)}</strong></p>`,
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    if (payload.kind === "edit_project_field") {
      return [
        "<p>I understood:</p>",
        "<p><strong>Edit project field</strong><br>",
        `Project: <strong>${escapeHtml(payload.projectName)}</strong><br>`,
        `Owner: ${escapeHtml(payload.userEmail ?? "(first unique match)")}<br>`,
        `Field: ${escapeHtml(describeEditableField(payload.field))}<br>`,
        `New value: ${escapeHtml(payload.value)}</p>`,
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    if (payload.kind === "archive_project" || payload.kind === "restore_project") {
      const heading = payload.kind === "archive_project" ? "Archive project" : "Restore project";
      return [
        "<p>I understood:</p>",
        `<p><strong>${escapeHtml(heading)}</strong><br>`,
        `Project: <strong>${escapeHtml(payload.projectName)}</strong><br>`,
        `Owner: ${escapeHtml(payload.userEmail ?? "(first unique match)")}</p>`,
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    if (payload.kind === "delete_project") {
      return [
        "<p>I understood:</p>",
        "<p><strong>Delete project (permanent)</strong><br>",
        `Project: <strong>${escapeHtml(payload.projectName)}</strong><br>`,
        `Owner: ${escapeHtml(payload.userEmail ?? "(first unique match)")}</p>`,
        "<p><strong>Warning:</strong> this will permanently remove the project and all related updates, transactions, and documents. This cannot be undone.</p>",
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    if (payload.kind === "create_user") {
      return [
        "<p>I understood:</p>",
        "<p><strong>Create user</strong><br>",
        `User: ${escapeHtml(payload.userEmail)}<br>`,
        "Tier: Freemium (default)</p>",
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    if (payload.kind === "create_project") {
      return [
        "<p>I understood:</p>",
        "<p><strong>Create project</strong><br>",
        `Project: <strong>${escapeHtml(payload.projectName)}</strong><br>`,
        `Owner: ${escapeHtml(payload.userEmail)}</p>`,
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    if (payload.kind === "upsert_instruction") {
      return [
        "<p>I understood:</p>",
        "<p><strong>Update instruction</strong><br>",
        `Key: ${escapeHtml(payload.key)}<br>`,
        `Content: ${escapeHtml(payload.content)}</p>`,
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    if (payload.kind === "upsert_email_template") {
      const field = payload.patch.subject !== undefined
        ? "subject"
        : payload.patch.htmlBody !== undefined
          ? "html"
          : "text";
      const value = payload.patch.subject ?? payload.patch.htmlBody ?? payload.patch.textBody ?? "";
      return [
        "<p>I understood:</p>",
        "<p><strong>Update email template</strong><br>",
        `Template: ${escapeHtml(payload.key)}<br>`,
        `Field: ${escapeHtml(describeEmailTemplateField(field))}<br>`,
        `New value: ${escapeHtml(value)}</p>`,
        '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
        "<p>&mdash; Frank</p>",
      ].join("");
    }

    return [
      "<p>I understood:</p>",
      "<p><strong>Update system setting</strong><br>",
      `Key: ${escapeHtml(payload.key)}<br>`,
      `Value: ${escapeHtml(JSON.stringify(payload.valueJson))}</p>`,
      '<p>Reply <strong>CONFIRM</strong> to proceed.</p>',
      "<p>&mdash; Frank</p>",
    ].join("");
  })();

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
      '- "Show updates for project Alpha Launch"',
      '- "Archive project Alpha Launch for user@email.com"',
      '- "Set instruction llm_document_usage to: ..."',
      '- "Update template project_update subject to: ..."',
      "",
      "— Frank",
    ].join("\n"),
    html: [
      `<p>${escapeHtml(message)}</p>`,
      "<p>Try one of these examples:</p>",
      "<ul>",
      "<li>Show me all users</li>",
      "<li>Show projects for user@email.com</li>",
      "<li>Show updates for project Alpha Launch</li>",
      "<li>Archive project Alpha Launch for user@email.com</li>",
      "<li>Set instruction llm_document_usage to: ...</li>",
      "<li>Update template project_update subject to: ...</li>",
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
  rows: Array<{ name: string; code: string; status: string; rpmEmail: string | null; archivedAt?: string | null }>,
): string[] {
  if (rows.length === 0) {
    return ["No projects found for that user."];
  }
  return rows.map((row) => {
    const rpm = row.rpmEmail ? `RPM: ${row.rpmEmail}` : "RPM: none";
    const archived = row.archivedAt ? " [archived]" : "";
    return `${row.name} [${row.code}] (${row.status})${archived} - ${rpm}`;
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

export function formatAdminProjectUpdateRows(
  rows: Array<{ createdAt: string; preview: string; senderEmail?: string | null }>,
): string[] {
  if (rows.length === 0) {
    return ["No updates recorded for this project."];
  }
  return rows.map((row) => {
    const timestamp = new Date(row.createdAt).toISOString().slice(0, 10);
    const sender = row.senderEmail ? ` (${row.senderEmail})` : "";
    return `${timestamp}${sender}: ${row.preview}`;
  });
}

export function formatAdminProjectStateSections(
  state: {
    summary: string;
    currentStatus: string;
    goals: string[];
    actionItems: string[];
    risks: string[];
    notes: string[];
  },
  sections: AdminEditableProjectField[] | null,
): string[] {
  const effective: AdminEditableProjectField[] =
    sections && sections.length > 0
      ? sections
      : ["summary", "current_status", "goals", "action_items", "risks", "notes"];

  const lines: string[] = [];
  for (const field of effective) {
    if (field === "summary") {
      lines.push(`Summary: ${state.summary || "(empty)"}`);
      continue;
    }
    if (field === "current_status") {
      lines.push(`Current Status: ${state.currentStatus || "(empty)"}`);
      continue;
    }
    const list =
      field === "goals"
        ? state.goals
        : field === "action_items"
          ? state.actionItems
          : field === "risks"
            ? state.risks
            : state.notes;
    const label = describeEditableField(field);
    if (list.length === 0) {
      lines.push(`${label}: (empty)`);
    } else {
      lines.push(`${label}:`);
      lines.push(...list.map((entry, index) => `  ${index + 1}. ${entry}`));
    }
  }
  return lines;
}

export function formatAdminDocumentRows(
  rows: Array<{ createdAt: string; kind: string; status: string; recipientCount: number }>,
): string[] {
  if (rows.length === 0) {
    return ["No generated documents recorded for this project."];
  }
  return rows.map((row) => {
    const timestamp = new Date(row.createdAt).toISOString().slice(0, 10);
    return `${timestamp} - ${row.kind} (${row.status}, ${row.recipientCount} recipient${row.recipientCount === 1 ? "" : "s"})`;
  });
}

export function formatAdminSettingRows(rows: Array<{ key: string; valueJson: unknown }>): string[] {
  if (rows.length === 0) {
    return ["No system settings match that filter."];
  }
  return rows.map((row) => `${row.key} = ${JSON.stringify(row.valueJson)}`);
}

export function formatAdminTemplateRows(
  rows: Array<{ key: string; subject: string; textBody: string; htmlBody: string }>,
  detailed: boolean,
): string[] {
  if (rows.length === 0) {
    return ["No email templates match that filter."];
  }
  if (!detailed) {
    return rows.map((row) => `${row.key}: ${row.subject || "(no subject)"}`);
  }
  const lines: string[] = [];
  for (const row of rows) {
    lines.push(`Template: ${row.key}`);
    lines.push(`  Subject: ${row.subject || "(empty)"}`);
    lines.push(`  Text: ${row.textBody || "(empty)"}`);
    lines.push(`  HTML: ${row.htmlBody || "(empty)"}`);
  }
  return lines;
}

export function formatAdminInstructionRows(
  rows: Array<{ key: string; content: string }>,
  detailed: boolean,
): string[] {
  if (rows.length === 0) {
    return ["No instructions match that filter."];
  }
  if (!detailed) {
    return rows.map((row) => {
      const preview = row.content.length > 80 ? `${row.content.slice(0, 80)}…` : row.content;
      return `${row.key}: ${preview || "(empty)"}`;
    });
  }
  const lines: string[] = [];
  for (const row of rows) {
    lines.push(`Instruction: ${row.key}`);
    lines.push(`  ${row.content || "(empty)"}`);
  }
  return lines;
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
  if (action.kind === "assign_rpm") {
    return `Assign RPM ${action.rpmEmail} to ${action.userEmail}`;
  }
  if (action.kind === "remove_rpm") {
    return `Remove RPM from ${action.userEmail} on project ${action.projectName}`;
  }
  if (action.kind === "edit_project_field") {
    return `Edit ${action.field} on project ${action.projectName}`;
  }
  if (action.kind === "archive_project") {
    return `Archive project ${action.projectName}`;
  }
  if (action.kind === "restore_project") {
    return `Restore project ${action.projectName}`;
  }
  if (action.kind === "delete_project") {
    return `Delete project ${action.projectName}`;
  }
  if (action.kind === "create_user") {
    return `Create user ${action.userEmail}`;
  }
  if (action.kind === "create_project") {
    return `Create project ${action.projectName} for ${action.userEmail}`;
  }
  if (action.kind === "upsert_instruction") {
    return `Update instruction ${action.key}`;
  }
  if (action.kind === "upsert_email_template") {
    return `Update email template ${action.key}`;
  }
  return `Update system setting ${action.key}`;
}
