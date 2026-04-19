import { getDefaultFromEmail } from "@/lib/env";
import { sendEmail } from "@/modules/email/sendEmail";

function buildReplySubject(originalSubject: string): string {
  return originalSubject.match(/^re:/i) ? originalSubject : `Re: ${originalSubject}`;
}

/**
 * Sends a reply to the user asking them to clarify their intent
 * when the inbound message was too vague to create a new project.
 */
export async function sendClarificationEmail(recipientEmail: string, originalSubject: string): Promise<void> {
  const replySubject = buildReplySubject(originalSubject);

  const text = [
    "Hey —",
    "",
    "I received your message, but I wasn’t sure what you’d like me to do.",
    "",
    "Just reply with what you're working on, and I’ll help you structure it.",
    "",
    "— Frank",
  ].join("\n");

  const html = `
<p>Hey &mdash;</p>
<p>I received your message, but I wasn&rsquo;t sure what you&rsquo;d like me to do.</p>
<p>Just reply with what you're working on, and I&rsquo;ll help you structure it.</p>
<p>&mdash; Frank</p>
`.trim();

  await sendEmail({
    to: recipientEmail,
    subject: replySubject,
    text,
    html,
    headers: { From: getDefaultFromEmail() },
  });
}

/**
 * RPM reply when a project update had no labeled project-memory sections (Goals, Tasks, etc.).
 */
export async function sendRpmStructuredProjectClarificationEmail(recipientEmail: string, originalSubject: string): Promise<void> {
  const replySubject = buildReplySubject(originalSubject);

  const text = [
    "Hey —",
    "",
    "I couldn’t detect a structured update.",
    "",
    "Please use one of the following labeled sections (each on its own line):",
    "",
    "Goals:",
    "- ...",
    "",
    "Action Items:",
    "- ...",
    "",
    "Risks:",
    "- ...",
    "",
    "Summary:",
    "(short overview text)",
    "",
    "Decisions:",
    "- ...",
    "",
    "Recommendations:",
    "- ...",
    "",
    "Notes:",
    "- ...",
    "",
    "— Frank",
  ].join("\n");

  const html = `
<p>Hey &mdash;</p>
<p>I couldn&rsquo;t detect a structured update.</p>
<p>Please use one of the following labeled sections (each on its own line):</p>
<ul>
<li><strong>Goals:</strong> with bullet lines</li>
<li><strong>Action Items:</strong> with bullet lines</li>
<li><strong>Risks:</strong> with bullet lines</li>
<li><strong>Summary:</strong> short overview text</li>
<li><strong>Decisions:</strong> / <strong>Recommendations:</strong> / <strong>Notes:</strong> as needed</li>
</ul>
<p>&mdash; Frank</p>
`.trim();

  await sendEmail({
    to: recipientEmail,
    subject: replySubject,
    text,
    html,
    headers: { From: getDefaultFromEmail() },
  });
}

/**
 * Sends a direct reply when an inbound email contains PDFs.
 */
export async function sendPdfResubmissionEmail(recipientEmail: string, originalSubject: string): Promise<void> {
  const replySubject = buildReplySubject(originalSubject);

  const text = [
    "Hey!",
    "",
    "Frank does not accept or parse PDF attachments.",
    "",
    "Please run the PDF through your best LLM first, then reply with the resulting text update.",
    "",
    "Once you send the text version, Frank can continue immediately.",
    "",
    "— Frank",
  ].join("\n");

  const html = `
<p>Hey!</p>
<p>Frank does not accept or parse PDF attachments.</p>
<p>Please run the PDF through your best LLM first, then reply with the resulting text update.</p>
<p>Once you send the text version, Frank can continue immediately.</p>
<p>&mdash; Frank</p>
`.trim();

  await sendEmail({
    to: recipientEmail,
    subject: replySubject,
    text,
    html,
    headers: { From: getDefaultFromEmail() },
  });
}

export async function sendCcMembershipConfirmationEmail(input: {
  recipientEmail: string;
  originalSubject: string;
  candidateEmails: string[];
}): Promise<void> {
  const replySubject = buildReplySubject(input.originalSubject);
  const listed = input.candidateEmails.map((email) => `- ${email}`).join("\n");
  const text = [
    `I noticed you included ${input.candidateEmails.join(", ")} (cc email).`,
    "",
    "Would you like to add them to your account?",
    "Reply:",
    '- "Yes, add them"',
    '- "No"',
    "",
    "Detected CC emails:",
    listed,
    "",
    "— Frank",
  ].join("\n");

  const html = `
<p>I noticed you included ${input.candidateEmails.map((email) => `<strong>${email}</strong>`).join(", ")} (cc email).</p>
<p>Would you like to add them to your account?</p>
<p>Reply:</p>
<ul>
  <li>&quot;Yes, add them&quot;</li>
  <li>&quot;No&quot;</li>
</ul>
<p>Detected CC emails:</p>
<ul>
  ${input.candidateEmails.map((email) => `<li>${email}</li>`).join("")}
</ul>
<p>&mdash; Frank</p>
`.trim();

  await sendEmail({
    to: input.recipientEmail,
    subject: replySubject,
    text,
    html,
    headers: { From: getDefaultFromEmail() },
  });
}
