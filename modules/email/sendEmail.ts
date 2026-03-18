import { getEmailProvider } from "@/modules/email/providers";

interface SendEmailInput {
  to: string;
  cc?: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { to, cc, subject, text, html } = input;

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

  await provider.sendEmail({
    to: recipients,
    cc: ccRecipients.length > 0 ? ccRecipients : undefined,
    subject,
    text: text?.trim() ?? "",
    html: html?.trim(),
  });
}
