import { sendEmail } from "@/modules/email/sendEmail";
import type { MemoryRepository, EscalationLogRecord, PendingApprovalRecord, ReviewFlagRecord } from "@/modules/memory/repository";

export type EscalationType = "RPM" | "Review" | "Approval";

export interface EscalationBlock {
  type: EscalationType;
  reason: string;
}

export interface EscalationNotification {
  recipients: string[];
  subject: string;
  text: string;
  html?: string;
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function squashWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function titleCaseAction(action: string): string {
  return action
    .trim()
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}

export function parseEscalationBlock(rawBody: string): EscalationBlock | null {
  const normalized = normalizeLineBreaks(rawBody);
  if (!/^\s*Escalation\s*:/im.test(normalized)) {
    return null;
  }

  const typeMatch = normalized.match(/(?:^|\n)\s*Type\s*:\s*(RPM|Review|Approval)\b/i);
  const reasonMatch = normalized.match(/(?:^|\n)\s*Reason\s*:\s*([\s\S]*)$/i);
  const reason = squashWhitespace(reasonMatch?.[1] ?? "");

  if (!typeMatch?.[1] || !reason) {
    return null;
  }

  const normalizedType = typeMatch[1].trim().toLowerCase();
  return {
    type:
      normalizedType === "rpm"
        ? "RPM"
        : normalizedType === "review"
          ? "Review"
          : "Approval",
    reason,
  };
}

export function parseApprovalDecision(rawBody: string): "approve" | "reject" | null {
  const normalized = squashWhitespace(rawBody).toLowerCase();
  if (normalized === "approve") {
    return "approve";
  }
  if (normalized === "reject") {
    return "reject";
  }
  return null;
}

export async function logEscalationReason(
  repo: MemoryRepository,
  input: { type: EscalationType; reason: string; projectId?: string | null },
): Promise<EscalationLogRecord> {
  return repo.createEscalationLog({
    type: input.type,
    reason: input.reason,
    projectId: input.projectId ?? null,
  });
}

export async function flagForReview(
  repo: MemoryRepository,
  input: { projectId: string; reason: string },
): Promise<ReviewFlagRecord> {
  await logEscalationReason(repo, {
    type: "Review",
    reason: input.reason,
    projectId: input.projectId,
  });
  return repo.createReviewFlag({
    projectId: input.projectId,
    reason: input.reason,
  });
}

export async function escalateToRPM(
  repo: MemoryRepository,
  input: {
    projectId: string;
    rpmEmail: string;
    reason: string;
    projectSummary: string;
    senderEmail: string;
  },
): Promise<{ log: EscalationLogRecord; notification: EscalationNotification }> {
  const log = await logEscalationReason(repo, {
    type: "RPM",
    reason: input.reason,
    projectId: input.projectId,
  });

  const subject = "Escalation: User needs help";
  const text = [
    `Reason: ${input.reason}`,
    "",
    "Project Summary:",
    input.projectSummary.trim() || "(no project summary provided)",
    "",
    `Sender: ${input.senderEmail}`,
  ].join("\n");

  const notification: EscalationNotification = {
    recipients: [input.rpmEmail],
    subject,
    text,
  };

  await sendEmail({
    to: input.rpmEmail,
    subject,
    text,
    allowMasterUserAsDirectRecipient: true,
  });

  return { log, notification };
}

export async function requestHumanApproval(
  repo: MemoryRepository,
  input: {
    projectId: string | null;
    rpmEmail: string;
    action: string;
    reason: string;
    projectSummary: string;
    senderEmail: string;
    sourceSubject?: string;
    sourceRawBody?: string;
  },
): Promise<{ log: EscalationLogRecord; approval: PendingApprovalRecord; notification: EscalationNotification }> {
  const log = await logEscalationReason(repo, {
    type: "Approval",
    reason: input.reason,
    projectId: input.projectId,
  });

  const approval = await repo.createPendingApproval({
    action: input.action,
    reason: input.reason,
    status: "pending",
    rpmEmail: input.rpmEmail,
    projectId: input.projectId,
    requestedByEmail: input.senderEmail,
    sourceSubject: input.sourceSubject ?? "",
    sourceRawBody: input.sourceRawBody ?? "",
  });

  const subject = `Approval requested: ${titleCaseAction(input.action)}`;
  const text = [
    "Approve or Reject",
    "",
    `Action: ${titleCaseAction(input.action)}`,
    `Reason: ${input.reason}`,
    "",
    "Project Summary:",
    input.projectSummary.trim() || "(no project summary provided)",
    "",
    `Sender: ${input.senderEmail}`,
  ].join("\n");

  const notification: EscalationNotification = {
    recipients: [input.rpmEmail],
    subject,
    text,
  };

  await sendEmail({
    to: input.rpmEmail,
    subject,
    text,
    allowMasterUserAsDirectRecipient: true,
  });

  return { log, approval, notification };
}

export function buildApprovalWaitReply(action: string, reason: string): { subject: string; text: string; html: string } {
  const actionLabel = titleCaseAction(action);
  return {
    subject: `Re: Approval requested: ${actionLabel}`,
    text: [
      "I'm waiting for a decision.",
      "",
      `Action: ${actionLabel}`,
      `Reason: ${reason}`,
      "",
      'Reply with "APPROVE" or "REJECT".',
    ].join("\n"),
    html: [
      "<p>I&rsquo;m waiting for a decision.</p>",
      `<p><strong>Action:</strong> ${actionLabel}<br>`,
      `<strong>Reason:</strong> ${reason}</p>`,
      '<p>Reply with <strong>APPROVE</strong> or <strong>REJECT</strong>.</p>',
    ].join(""),
  };
}
