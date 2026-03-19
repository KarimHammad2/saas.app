import { sendEmail } from "@/modules/email/sendEmail";
import { getRuntimeConfig, renderProjectUpdateTemplate } from "@/modules/config/runtimeConfig";
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

  const runtime = await getRuntimeConfig();
  const document = generateProjectDocument(payload);
  const projectHtml = formatProjectEmail(payload);
  const summary = payload.context.summary || "Latest project memory regenerated.";
  const template = payload.isWelcome ? runtime.projectWelcomeTemplate : runtime.projectUpdateTemplate;
  const rendered = renderProjectUpdateTemplate(template, summary, document, runtime.llmInstruction);
  const documentHtml = [
    "<h2>Download full project document</h2>",
    "<p>Included below in this email:</p>",
    `<pre>${escapeHtml(document)}</pre>`,
  ].join("\n");
  const html = [rendered.html, "<hr/>", projectHtml, documentHtml].join("\n");
  const bcc = runtime.adminBccEnabled && runtime.adminBccAddress ? runtime.adminBccAddress : undefined;

  await sendEmail({
    to: to.join(","),
    bcc,
    subject: rendered.subject,
    text: `${rendered.text}\n\n${document}\n\n${runtime.llmInstruction}`,
    html,
    attachments: [
      {
        filename: "project-document.md",
        content: document,
      },
    ],
  });
}
