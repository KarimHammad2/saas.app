import { randomUUID } from "node:crypto";

import { wrapEmailDocument } from "@/modules/email/buildHtmlEmail";
import { normalizeMessageId } from "@/modules/email/messageId";
import { sendEmail } from "@/modules/email/sendEmail";
import { getRuntimeConfig } from "@/modules/config/runtimeConfig";
import { generateProjectDocument } from "@/modules/output/generateProjectDocument";
import { formatProjectEmail } from "@/modules/output/formatProjectEmail";
import { compactOverviewForDocument } from "@/modules/output/overviewText";
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

function truncateTitle(value: string, max = 80): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled project";
  }
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3).trimEnd()}...`;
}

function deriveProjectTitle(payload: ProjectEmailPayload): string {
  const firstSummaryLine = payload.context.summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const compact = compactOverviewForDocument(firstSummaryLine ?? payload.context.summary);
  const candidate = compact || payload.context.projectName || "Untitled project";
  return truncateTitle(candidate, 80);
}

function deriveProjectStatus(payload: ProjectEmailPayload): string {
  if (payload.context.actionItems.length > 0) {
    return "In Progress";
  }
  if (payload.context.completedTasks.length > 0) {
    return "Completed";
  }
  if (payload.context.goals.length > 0) {
    return "Planning";
  }
  return "Unknown";
}

function deriveLastUpdate(payload: ProjectEmailPayload): string {
  const latest = payload.context.recentUpdatesLog[payload.context.recentUpdatesLog.length - 1];
  if (!latest) {
    return "N/A";
  }
  const withoutDate = latest.replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, "").trim();
  return withoutDate || "N/A";
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
  const projectTitle = deriveProjectTitle(payload);
  const derivedStatus = deriveProjectStatus(payload);
  const derivedLastUpdate = deriveLastUpdate(payload);

  let finalSubject = `${stripProjectCodeFromSubject(baseSubject)} — ${projectTitle}`.trim();
  if (payload.context.projectCode?.trim()) {
    finalSubject = `${finalSubject} ${formatProjectCodeBracket(payload.context.projectCode)}`.trim();
  }

  const rawMessageId = `<${randomUUID()}@saas2.app>`;
  const outboundMessageId = normalizeMessageId(rawMessageId);
  const contextHeaderLines = [
    `Project: ${projectTitle}`,
    `Status: ${derivedStatus}`,
    `Last Update: ${derivedLastUpdate}`,
    "",
    "You are working on:",
    `"${projectTitle}"`,
    "---",
  ];
  const introHtml = bodyToHtmlParagraphs(emailBody);
  const contextHtml = [
    `<p><strong>Project:</strong> ${escapeHtmlText(projectTitle)}</p>`,
    `<p><strong>Status:</strong> ${escapeHtmlText(derivedStatus)}</p>`,
    `<p><strong>Last Update:</strong> ${escapeHtmlText(derivedLastUpdate)}</p>`,
    `<p>You are working on:</p>`,
    `<p>"${escapeHtmlText(projectTitle)}"</p>`,
    "<hr class=\"email-divider\" />",
  ].join("\n");
  const footerHtml =
    '<p class="email-footer">Attachment: <strong>project-document.md</strong> (LLM operating context).</p>';
  const innerHtml = [contextHtml, introHtml, footerHtml].join("\n");
  const html = wrapEmailDocument(innerHtml);
  const bcc = runtime.adminBccEnabled && runtime.adminBccAddress ? runtime.adminBccAddress : undefined;

  const text = [...contextHeaderLines, "", emailBody, "", "Attachment: project-document.md"].join("\n");

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
