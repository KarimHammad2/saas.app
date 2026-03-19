import { sendEmail } from "@/modules/email/sendEmail";
import { getAdminBccEmail, getEnableAdminBcc } from "@/src/config/env";
import { buildProjectUpdateEmailHtml, buildProjectUpdateEmailText } from "@/src/email/emailTemplates";

function summarizeDocument(document: string): string {
  const nonEmpty = document
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return nonEmpty[1] ?? "Latest project memory regenerated.";
}

export async function sendProjectUpdateEmail(to: string, document: string): Promise<void> {
  const summary = summarizeDocument(document);
  const bcc = getEnableAdminBcc() ? getAdminBccEmail() ?? undefined : undefined;

  await sendEmail({
    to,
    bcc,
    subject: "Your Updated Project Document",
    text: buildProjectUpdateEmailText(summary, document),
    html: buildProjectUpdateEmailHtml(summary, document),
    attachments: [
      {
        filename: "project-document.md",
        content: document,
      },
    ],
  });
}
