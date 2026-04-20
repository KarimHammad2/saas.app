import { randomUUID } from "node:crypto";

import { getMasterUserEmail } from "@/lib/env";
import { wrapEmailDocument } from "@/modules/email/buildHtmlEmail";
import { normalizeMessageId } from "@/modules/email/messageId";
import { sendEmail } from "@/modules/email/sendEmail";
import { getRuntimeConfig } from "@/modules/config/runtimeConfig";
import type { ProjectContext, TransactionPaymentMeta, TransactionRecord } from "@/modules/contracts/types";
import { partitionRecipientsForRpmCopy } from "@/modules/output/sendProjectEmail";

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

function bodyToHtmlParagraphs(body: string): string {
  return body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtmlText(p)}</p>`)
    .join("\n");
}

function buildBccList(adminBcc?: string | null, adminBccEnabled?: boolean): string | undefined {
  if (!adminBccEnabled || !adminBcc?.trim()) {
    return undefined;
  }
  return adminBcc.trim().toLowerCase();
}

export function formatPaymentInstructionsBody(payment: TransactionPaymentMeta): string {
  return [
    `Your purchase total is $${payment.paymentTotal} (hours × rate).`,
    "",
    `Pay here: ${payment.paymentLinkUrl}`,
    "",
    "After you complete checkout, reply to this email with the word Paid so we can activate your transaction.",
  ].join("\n");
}

export function formatPaymentConfirmedPlainText(context: ProjectContext, paid: TransactionRecord): string {
  const name = (context.projectName ?? "Untitled Project").trim() || "Untitled Project";
  return [
    "Payment confirmed.",
    "",
    "Your transaction is now active.",
    "",
    "Financial Summary:",
    `- Hours Purchased: ${paid.hoursPurchased}`,
    `- Rate: $${paid.hourlyRate}`,
    `- Allocated: ${paid.allocatedHours}`,
    `- Buffer: ${paid.bufferHours}`,
    "",
    `Remainder Balance: ${context.remainderBalance}`,
    "",
    "Next Steps:",
    "- Work can now begin",
    `- Frank will continue coordinating the project (${name}).`,
  ].join("\n");
}

export async function sendPaymentInstructionsEmail(input: {
  recipients: string[];
  projectCode: string;
  projectName: string;
  payment: TransactionPaymentMeta;
  activeRpmEmail: string | null;
}): Promise<string[]> {
  const deduped = Array.from(new Set(input.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  const { standard, rpmOnly } = partitionRecipientsForRpmCopy(deduped, input.activeRpmEmail);
  const runtime = await getRuntimeConfig();
  const bcc = buildBccList(runtime.adminBccAddress, runtime.adminBccEnabled);
  const allowMasterUserInBcc = Boolean(bcc && bcc === getMasterUserEmail());
  const bracket = formatProjectCodeBracket(input.projectCode);
  const subject = `Complete your payment — ${input.projectName.trim() || "Project"} ${bracket}`.trim();
  const textBody = formatPaymentInstructionsBody(input.payment);
  const html = wrapEmailDocument(bodyToHtmlParagraphs(textBody));
  const outboundMessageIds: string[] = [];
  let includeAdminBcc = true;

  const sendOne = async (to: string[]): Promise<void> => {
    const rawMessageId = `<${randomUUID()}@saas2.app>`;
    const outboundMessageId = normalizeMessageId(rawMessageId);
    outboundMessageIds.push(outboundMessageId);
    await sendEmail({
      to: to.join(","),
      bcc: includeAdminBcc ? bcc : undefined,
      allowMasterUserInBcc: includeAdminBcc && allowMasterUserInBcc,
      allowMasterUserAsDirectRecipient: true,
      subject,
      text: textBody,
      html,
      headers: {
        "Message-ID": rawMessageId,
        "X-SaaS2-System": "true",
        "X-SaaS2-Message-Type": "payment-instructions",
      },
    });
    includeAdminBcc = false;
  };

  if (standard.length > 0) {
    await sendOne(standard);
  }
  if (rpmOnly.length > 0) {
    await sendOne(rpmOnly);
  }
  return outboundMessageIds;
}

export async function sendPaymentConfirmedEmail(input: {
  recipients: string[];
  activeRpmEmail: string | null;
  plainTextBody: string;
}): Promise<string[]> {
  const deduped = Array.from(new Set(input.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  const { standard, rpmOnly } = partitionRecipientsForRpmCopy(deduped, input.activeRpmEmail);
  const runtime = await getRuntimeConfig();
  const bcc = buildBccList(runtime.adminBccAddress, runtime.adminBccEnabled);
  const allowMasterUserInBcc = Boolean(bcc && bcc === getMasterUserEmail());
  const subject = "Payment Confirmed";
  const html = wrapEmailDocument(bodyToHtmlParagraphs(input.plainTextBody));
  const outboundMessageIds: string[] = [];
  let includeAdminBcc = true;

  const sendOne = async (to: string[]): Promise<void> => {
    const rawMessageId = `<${randomUUID()}@saas2.app>`;
    outboundMessageIds.push(normalizeMessageId(rawMessageId));
    await sendEmail({
      to: to.join(","),
      bcc: includeAdminBcc ? bcc : undefined,
      allowMasterUserInBcc: includeAdminBcc && allowMasterUserInBcc,
      allowMasterUserAsDirectRecipient: true,
      subject,
      text: input.plainTextBody,
      html,
      headers: {
        "Message-ID": rawMessageId,
        "X-SaaS2-System": "true",
        "X-SaaS2-Message-Type": "payment-confirmed",
      },
    });
    includeAdminBcc = false;
  };

  if (standard.length > 0) {
    await sendOne(standard);
  }
  if (rpmOnly.length > 0) {
    await sendOne(rpmOnly);
  }
  return outboundMessageIds;
}
