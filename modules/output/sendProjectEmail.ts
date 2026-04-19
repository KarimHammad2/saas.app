import { randomUUID } from "node:crypto";

import { getMasterUserEmail } from "@/lib/env";
import { wrapEmailDocument } from "@/modules/email/buildHtmlEmail";
import { normalizeMessageId } from "@/modules/email/messageId";
import { sendEmail } from "@/modules/email/sendEmail";
import { getRuntimeConfig } from "@/modules/config/runtimeConfig";
import { generateProjectDocument } from "@/modules/output/generateProjectDocument";
import { formatProjectEmail, formatProjectEmailForRpm } from "@/modules/output/formatProjectEmail";
import type { ProjectEmailKind, ProjectEmailPayload } from "@/modules/output/types";

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

function buildEmailSubject(payload: ProjectEmailPayload, baseSubject: string): string {
  const projectCode = payload.context.projectCode?.trim();
  if (!projectCode) {
    throw new Error("Project outbound email requires context.projectCode.");
  }
  const projectName = payload.context.projectName?.trim() || "Untitled Project";
  return `${baseSubject} — ${projectName} ${formatProjectCodeBracket(projectCode)}`.trim();
}

function buildBccList(adminBcc?: string | null, adminBccEnabled?: boolean): string | undefined {
  if (!adminBccEnabled || !adminBcc?.trim()) {
    return undefined;
  }
  return adminBcc.trim().toLowerCase();
}

export function validateProjectDocumentForAttachment(document: string): void {
  const trimmed = document.trim();
  if (!trimmed) {
    throw new Error("Generated project document is empty.");
  }
  if (Buffer.byteLength(trimmed, "utf-8") > 512_000) {
    throw new Error("Generated project document exceeds safe attachment size limit.");
  }
  const requiredHeadings = [
    "## Project Metadata",
    "## User Profile Context",
    "## Instructions to LLM",
    "## Project Overview",
    "## Goals",
    "## Tasks",
    "### In Progress",
    "### Completed",
    "## Risks",
    "## Decisions",
    "## Notes",
    "## Recent Updates",
    "## Pending Suggestions",
  ];
  for (const heading of requiredHeadings) {
    if (!trimmed.includes(heading)) {
      throw new Error(`Generated project document is missing required section: ${heading}`);
    }
  }
}

function partitionRecipientsForRpmCopy(
  recipients: string[],
  activeRpmEmail: string | null | undefined,
): { standard: string[]; rpmOnly: string[] } {
  const rpm = activeRpmEmail?.trim().toLowerCase() ?? "";
  if (!rpm) {
    return { standard: recipients, rpmOnly: [] };
  }
  const standard: string[] = [];
  const rpmOnly: string[] = [];
  for (const raw of recipients) {
    const n = raw.trim().toLowerCase();
    if (!n) {
      continue;
    }
    if (n === rpm) {
      rpmOnly.push(raw.trim().toLowerCase());
    } else {
      standard.push(raw.trim().toLowerCase());
    }
  }
  return { standard, rpmOnly };
}

export async function sendProjectEmail(
  recipients: string[],
  payload: ProjectEmailPayload,
): Promise<{ outboundMessageId: string; outboundMessageIds: string[] }> {
  const deduped = Array.from(new Set(recipients.map((entry) => entry.trim().toLowerCase()).filter(Boolean)));
  if (deduped.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  const { standard, rpmOnly } = partitionRecipientsForRpmCopy(deduped, payload.context.activeRpmEmail);

  const runtime = await getRuntimeConfig();
  const document = generateProjectDocument(payload);
  validateProjectDocumentForAttachment(document);
  const kind = resolveEmailKind(payload);
  const messageType =
    kind === "reminder"
      ? "project-reminder"
      : kind === "kickoff"
        ? "project-kickoff"
        : kind === "welcome"
          ? "project-welcome"
          : "project-update";
  const bcc = buildBccList(runtime.adminBccAddress, runtime.adminBccEnabled);
  const allowMasterUserInBcc = Boolean(bcc && bcc === getMasterUserEmail());

  const outboundMessageIds: string[] = [];
  let includeAdminBcc = true;

  const sendOne = async (to: string[], emailBody: string): Promise<void> => {
    const { subject: baseSubject } = formatProjectEmail(payload);
    const finalSubject = buildEmailSubject(payload, baseSubject);
    const rawMessageId = `<${randomUUID()}@saas2.app>`;
    const outboundMessageId = normalizeMessageId(rawMessageId);
    outboundMessageIds.push(outboundMessageId);
    const introHtml = bodyToHtmlParagraphs(emailBody);
    const footerHtml =
      '<p class="email-footer">Attachment: <strong>project-document.md</strong> (LLM operating context).</p>';
    const innerHtml = [introHtml, footerHtml].join("\n");
    const html = wrapEmailDocument(innerHtml);
    const text = [emailBody, "", "Attachment: project-document.md"].join("\n");

    const useBcc = includeAdminBcc ? bcc : undefined;
    const useAllowMasterInBcc = includeAdminBcc && allowMasterUserInBcc;
    includeAdminBcc = false;

    await sendEmail({
      to: to.join(","),
      bcc: useBcc,
      allowMasterUserInBcc: useAllowMasterInBcc,
      allowMasterUserAsDirectRecipient: true,
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
  };

  if (standard.length > 0) {
    await sendOne(standard, formatProjectEmail(payload).body);
  }
  if (rpmOnly.length > 0) {
    await sendOne(rpmOnly, formatProjectEmailForRpm(payload).body);
  }

  const outboundMessageId = outboundMessageIds[0] ?? "";
  return { outboundMessageId, outboundMessageIds };
}
