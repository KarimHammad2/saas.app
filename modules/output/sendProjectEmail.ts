import { sendEmail } from "@/modules/email/sendEmail";
import { generateProjectDocument } from "@/modules/output/generateProjectDocument";
import { formatProjectEmail } from "@/modules/output/formatProjectEmail";
import type { ProjectEmailPayload } from "@/modules/output/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendProjectEmail(recipients: string[], payload: ProjectEmailPayload): Promise<void> {
  const to = Array.from(new Set(recipients.map((entry) => entry.trim().toLowerCase()).filter(Boolean)));
  if (to.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  const document = generateProjectDocument(payload);
  const projectHtml = formatProjectEmail(payload);
  const documentHtml = [
    "<h2>Download full project document</h2>",
    "<p>Included below in this email:</p>",
    `<pre>${escapeHtml(document)}</pre>`,
  ].join("\n");
  const html = ["<!doctype html>", "<html>", "<body>", projectHtml, documentHtml, "</body>", "</html>"].join("\n");

  await sendEmail({
    to: to.join(","),
    subject: "Project Update",
    text: `Project Update\n\n${document}\n\nDownload full project document:\nIncluded below in this message.`,
    html,
  });
}
