import { randomUUID } from "node:crypto";

import { extractBodyInner, wrapEmailDocument } from "@/modules/email/buildHtmlEmail";
import { normalizeMessageId } from "@/modules/email/messageId";
import { sendEmail } from "@/modules/email/sendEmail";
import { getRuntimeConfig, renderProjectUpdateTemplate } from "@/modules/config/runtimeConfig";
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

export async function sendProjectEmail(recipients: string[], payload: ProjectEmailPayload): Promise<{ outboundMessageId: string }> {
  const to = Array.from(new Set(recipients.map((entry) => entry.trim().toLowerCase()).filter(Boolean)));
  if (to.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  const runtime = await getRuntimeConfig();
  const document = generateProjectDocument(payload);
  const projectHtml = formatProjectEmail(payload);
  const summary = payload.context.summary || "Latest project memory regenerated.";
  const kind = resolveEmailKind(payload);
  const template =
    kind === "kickoff"
      ? runtime.projectKickoffTemplate
      : kind === "welcome"
      ? runtime.projectWelcomeTemplate
      : kind === "reminder"
        ? runtime.projectReminderTemplate
        : runtime.projectUpdateTemplate;
  const rendered = renderProjectUpdateTemplate(template, summary, document, runtime.llmInstruction);
  let finalSubject = rendered.subject;
  if (payload.context.projectCode?.trim()) {
    finalSubject = `${stripProjectCodeFromSubject(rendered.subject)} ${formatProjectCodeBracket(payload.context.projectCode)}`.trim();
  }

  const rawMessageId = `<${randomUUID()}@saas2.app>`;
  const outboundMessageId = normalizeMessageId(rawMessageId);
  const introHtml = extractBodyInner(rendered.html);
  const footerHtml = [
    '<p class="email-footer">The full project document is attached as <strong>project-document.md</strong>.</p>',
    '<p class="email-footer">Open it in ChatGPT or Gemini whenever you need full context for your project.</p>',
  ].join("");
  const innerHtml = [introHtml, '<hr class="email-divider" />', projectHtml, footerHtml].join("\n");
  const html = wrapEmailDocument(innerHtml);
  const bcc = runtime.adminBccEnabled && runtime.adminBccAddress ? runtime.adminBccAddress : undefined;

  const text = [
    rendered.text,
    "",
    "Full project document: see attachment project-document.md",
    "",
    runtime.llmInstruction,
  ].join("\n");

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
