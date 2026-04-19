import { randomUUID } from "node:crypto";

import { getInboundTriggerEmail } from "@/lib/env";
import { wrapEmailDocument } from "@/modules/email/buildHtmlEmail";
import { sendEmail } from "@/modules/email/sendEmail";
import { normalizeMessageId } from "@/modules/email/messageId";
import type { ProjectContext, RPMSuggestion } from "@/modules/contracts/types";

function formatProjectCodeBracket(projectCode: string): string {
  const hex = projectCode.replace(/^pjt-/i, "").toUpperCase();
  return `[PJT-${hex}]`;
}

function escapeHtmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildProposalHtml(suggestionContent: string, suggestionId: string, frankEmail: string): string {
  const lines = suggestionContent.trim().split(/\n+/);
  const bodyParagraphs = lines.map((line) => `<p>${escapeHtmlText(line)}</p>`).join("\n");
  return [
    "<h1>Profile update proposed</h1>",
    "<p>Your RPM proposed the following change to your user profile context (not applied until you approve):</p>",
    bodyParagraphs,
    '<hr class="email-divider" />',
    "<h2>Your decision</h2>",
    `<p>Reply to <strong>${escapeHtmlText(frankEmail)}</strong> with one of:</p>`,
    "<ul>",
    `<li><code>approve suggestion ${escapeHtmlText(suggestionId)}</code></li>`,
    `<li><code>reject suggestion ${escapeHtmlText(suggestionId)}</code></li>`,
    "</ul>",
    '<p class="email-footer">No project file is attached until you approve. After approval, you and your RPM will receive the updated project document as usual.</p>',
  ].join("\n");
}

function buildProposalText(suggestionContent: string, suggestionId: string, frankEmail: string): string {
  return [
    "Profile update proposed",
    "",
    "Your RPM proposed the following change to your user profile context (not applied until you approve):",
    "",
    suggestionContent.trim(),
    "",
    "---",
    "",
    "Your decision",
    "",
    `Reply to ${frankEmail} with one of:`,
    "",
    `  approve suggestion ${suggestionId}`,
    "",
    `  reject suggestion ${suggestionId}`,
    "",
    "No project file is attached until you approve. After approval, you and your RPM will receive the updated project document as usual.",
  ].join("\n");
}

export interface SendRpmProfileProposalEmailInput {
  ownerEmail: string;
  context: Pick<ProjectContext, "projectCode" | "projectName">;
  suggestion: RPMSuggestion;
}

/**
 * Short, attachment-free email to the project owner when an RPM submits only a UserProfile Suggestion.
 */
export async function sendRpmProfileProposalEmail(input: SendRpmProfileProposalEmailInput): Promise<{ outboundMessageId: string }> {
  const owner = input.ownerEmail.trim().toLowerCase();
  if (!owner.includes("@")) {
    throw new Error("RPM proposal email requires a valid owner email.");
  }
  const projectCode = input.context.projectCode?.trim();
  if (!projectCode) {
    throw new Error("RPM proposal email requires context.projectCode.");
  }
  const projectName = input.context.projectName?.trim() || "Untitled Project";
  const frankEmail = getInboundTriggerEmail();
  const suggestionId = input.suggestion.id.trim();
  const text = buildProposalText(input.suggestion.content, suggestionId, frankEmail);
  const innerHtml = buildProposalHtml(input.suggestion.content, suggestionId, frankEmail);
  const html = wrapEmailDocument(innerHtml);

  const subject = `Action required: profile suggestion — ${projectName} ${formatProjectCodeBracket(projectCode)}`.trim();

  const rawMessageId = `<${randomUUID()}@saas2.app>`;
  const outboundMessageId = normalizeMessageId(rawMessageId);

  await sendEmail({
    to: owner,
    subject,
    text,
    html,
    allowMasterUserAsDirectRecipient: true,
    headers: {
      "Message-ID": rawMessageId,
      "X-SaaS2-System": "true",
      "X-SaaS2-Message-Type": "rpm-profile-proposal",
    },
  });

  return { outboundMessageId };
}
