import { getEmailProvider, getFallbackEmailProvider } from "@/modules/email/providers";
import { log } from "@/lib/log";
import { getMasterUserEmail } from "@/lib/env";

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

  const primaryProvider = getEmailProvider();
  const fallbackProvider = getFallbackEmailProvider(primaryProvider.name);
  const pausedMasterEmail = getMasterUserEmail();
  const normalize = (value: string): string => value.trim().toLowerCase();
  const shouldDeliverTo = (email: string): boolean => normalize(email) !== pausedMasterEmail;
  const recipients = to
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(shouldDeliverTo);
  const ccRecipients = (cc ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(shouldDeliverTo);
  const bccRecipients = (bcc ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(shouldDeliverTo);

  const initialRecipientCount = to
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean).length;
  if (initialRecipientCount !== recipients.length) {
    log.info("suppressed paused master email recipient", {
      pausedMasterEmail,
      suppressedCount: initialRecipientCount - recipients.length,
      finalRecipientCount: recipients.length,
      subject,
    });
  }
  if (recipients.length === 0) {
    log.info("skipping email delivery with no primary recipients after suppression", {
      pausedMasterEmail,
      subject,
    });
    return;
  }

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
      await primaryProvider.sendEmail(message);
      return;
    } catch (error) {
      const causeMessage = error instanceof Error ? error.message : String(error);
      const finalAttempt = attempt >= maxAttempts;
      log.warn("email delivery attempt failed", {
        provider: primaryProvider.name,
        attempt,
        maxAttempts,
        recipientCount: recipients.length,
        causeMessage,
      });

      if (finalAttempt) {
        log.error("email delivery failed after retries", {
          provider: primaryProvider.name,
          attempts: attempt,
          recipientCount: recipients.length,
          causeMessage,
        });
        if (fallbackProvider) {
          try {
            await fallbackProvider.sendEmail(message);
            log.info("email delivery succeeded via fallback provider", {
              primaryProvider: primaryProvider.name,
              fallbackProvider: fallbackProvider.name,
              recipientCount: recipients.length,
            });
            return;
          } catch (fallbackError) {
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            log.error("email delivery failed on fallback provider", {
              primaryProvider: primaryProvider.name,
              fallbackProvider: fallbackProvider.name,
              recipientCount: recipients.length,
              fallbackMessage,
            });
          }
        }
        throw error instanceof Error ? error : new Error(causeMessage);
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
