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
