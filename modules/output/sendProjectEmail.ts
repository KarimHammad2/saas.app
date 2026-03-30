import { extractBodyInner, wrapEmailDocument } from "@/modules/email/buildHtmlEmail";
import { sendEmail } from "@/modules/email/sendEmail";
import { getRuntimeConfig, renderProjectUpdateTemplate } from "@/modules/config/runtimeConfig";
import { generateProjectDocument } from "@/modules/output/generateProjectDocument";
import { formatProjectEmail } from "@/modules/output/formatProjectEmail";
import type { ProjectEmailKind, ProjectEmailPayload } from "@/modules/output/types";

function resolveEmailKind(payload: ProjectEmailPayload): ProjectEmailKind {
  if (payload.emailKind) {
    return payload.emailKind;
  }
  return payload.isWelcome ? "kickoff" : "update";
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
  const kind = resolveEmailKind(payload);
  const template =
    kind === "kickoff"
      ? runtime.projectKickoffTemplate
      : kind === "welcome"
      ? runtime.projectWelcomeTemplate
      : kind === "reminder"
        ? runtime.projectReminderTemplate
        : runtime.projectUpdateTemplate;
  const rendered = renderProjectUpdateTemplate(template, summary, document, runtime.llmInstruction);
  const introHtml = extractBodyInner(rendered.html);
  const footerHtml = [
    '<p class="email-footer">The full project document is attached as <strong>project-document.md</strong>.</p>',
    '<p class="email-footer">Open it in ChatGPT or Gemini whenever you need full context for your project.</p>',
  ].join("");
  const innerHtml = [introHtml, '<hr class="email-divider" />', projectHtml, footerHtml].join("\n");
  const html = wrapEmailDocument(innerHtml);
  const bcc = runtime.adminBccEnabled && runtime.adminBccAddress ? runtime.adminBccAddress : undefined;

  const text = [
    rendered.text,
    "",
    "Full project document: see attachment project-document.md",
    "",
    runtime.llmInstruction,
  ].join("\n");

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
    subject: rendered.subject,
    text,
    html,
    headers: {
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
}
