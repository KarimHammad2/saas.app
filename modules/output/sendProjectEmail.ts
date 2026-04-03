import { randomUUID } from "node:crypto";

import { wrapEmailDocument } from "@/modules/email/buildHtmlEmail";
import { normalizeMessageId } from "@/modules/email/messageId";
import { sendEmail } from "@/modules/email/sendEmail";
import { getRuntimeConfig } from "@/modules/config/runtimeConfig";
import { generateProjectDocument } from "@/modules/output/generateProjectDocument";
import { formatProjectEmail } from "@/modules/output/formatProjectEmail";
import type { ProjectEmailKind, ProjectEmailPayload } from "@/modules/output/types";

function stripProjectCodeFromSubject(subject: string): string {
  return subject
    .replace(/\s*\[PJT-[A-F0-9]{6,10}\]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatProjectCodeBracket(projectCode: string): string {
  const hex = projectCode.replace(/^pjt-/i, "").toUpperCase();
  return `[PJT-${hex}]`;
}

function resolveEmailKind(payload: ProjectEmailPayload): ProjectEmailKind {
  if (payload.emailKind) {
    return payload.emailKind;
  }
  return payload.isWelcome ? "kickoff" : "update";
}

function escapeHtmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bodyToHtmlParagraphs(body: string): string {
  return body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtmlText(p)}</p>`)
    .join("\n");
}

export async function sendProjectEmail(recipients: string[], payload: ProjectEmailPayload): Promise<{ outboundMessageId: string }> {
  const to = Array.from(new Set(recipients.map((entry) => entry.trim().toLowerCase()).filter(Boolean)));
  if (to.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  const runtime = await getRuntimeConfig();
  const document = generateProjectDocument(payload);
  const { subject: baseSubject, body: emailBody } = formatProjectEmail(payload);
  const kind = resolveEmailKind(payload);

  let finalSubject = baseSubject;
  if (payload.context.projectCode?.trim()) {
    finalSubject = `${stripProjectCodeFromSubject(baseSubject)} ${formatProjectCodeBracket(payload.context.projectCode)}`.trim();
  }

  const rawMessageId = `<${randomUUID()}@saas2.app>`;
  const outboundMessageId = normalizeMessageId(rawMessageId);
  const introHtml = bodyToHtmlParagraphs(emailBody);
  const footerHtml =
    '<p class="email-footer">Attachment: <strong>project-document.md</strong> (LLM operating context).</p>';
  const innerHtml = [introHtml, footerHtml].join("\n");
  const html = wrapEmailDocument(innerHtml);
  const bcc = runtime.adminBccEnabled && runtime.adminBccAddress ? runtime.adminBccAddress : undefined;

  const text = [emailBody, "", "Attachment: project-document.md"].join("\n");

  const messageType =
    kind === "reminder"
      ? "project-reminder"
      : kind === "kickoff"
        ? "project-kickoff"
        : kind === "welcome"
          ? "project-welcome"
          : "project-update";

  await sendEmail({
    to: to.join(","),
    bcc,
    subject: finalSubject,
    text,
    html,
    headers: {
      "Message-ID": rawMessageId,
      "X-SaaS2-System": "true",
      "X-SaaS2-Message-Type": messageType,
    },
    attachments: [
      {
        filename: "project-document.md",
        content: document,
      },
    ],
  });

  return { outboundMessageId };
}
