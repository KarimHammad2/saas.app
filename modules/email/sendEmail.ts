import { getEmailProvider } from "@/modules/email/providers";
import { log } from "@/lib/log";

interface SendEmailInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
  }>;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { to, cc, bcc, subject, text, html, headers, attachments } = input;

  if (!to.trim()) {
    throw new Error("Recipient email is required.");
  }

  if (!text?.trim() && !html?.trim()) {
    throw new Error("Email body is required (text or html).");
  }

  const provider = getEmailProvider();
  const recipients = to
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const ccRecipients = (cc ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const bccRecipients = (bcc ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const message = {
    to: recipients,
    cc: ccRecipients.length > 0 ? ccRecipients : undefined,
    bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
    subject,
    text: text?.trim() ?? "",
    html: html?.trim(),
    headers,
    attachments,
  };

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await provider.sendEmail(message);
      return;
    } catch (error) {
      const causeMessage = error instanceof Error ? error.message : String(error);
      const finalAttempt = attempt >= maxAttempts;
      log.warn("email delivery attempt failed", {
        provider: provider.name,
        attempt,
        maxAttempts,
        recipientCount: recipients.length,
        causeMessage,
      });

      if (finalAttempt) {
        log.error("email delivery failed after retries", {
          provider: provider.name,
          attempts: attempt,
          recipientCount: recipients.length,
          causeMessage,
        });
        throw error instanceof Error ? error : new Error(causeMessage);
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
