import { getDefaultFromEmail } from "@/lib/env";
import { sendEmail } from "@/modules/email/sendEmail";

/**
 * Sends a reply to the user asking them to clarify their intent
 * when the inbound message was too vague to create a new project.
 */
export async function sendClarificationEmail(recipientEmail: string, originalSubject: string): Promise<void> {
  const replySubject = originalSubject.match(/^re:/i) ? originalSubject : `Re: ${originalSubject}`;

  const text = [
    "Hey!",
    "",
    "I received your message, but I wasn't sure what you'd like me to do with it.",
    "",
    "Here's what you can do:",
    "",
    "1. Start a new project — Reply to this email with a description of what you're working on.",
    "   Example: \"I want to build a SaaS app for invoice tracking for small businesses.\"",
    "",
    "2. Update an existing project — Forward or reply to a previous email from me that contains",
    "   your project code (e.g. [PJT-A1B2C3D4]) in the subject line.",
    "",
    "What would you like to do?",
    "",
    "— Frank",
  ].join("\n");

  const html = `
<p>Hey!</p>
<p>I received your message, but I wasn&rsquo;t sure what you&rsquo;d like me to do with it.</p>
<p><strong>Here&rsquo;s what you can do:</strong></p>
<ol>
  <li>
    <strong>Start a new project</strong> &mdash; Reply to this email with a description of what you&rsquo;re working on.<br/>
    <em>Example: &ldquo;I want to build a SaaS app for invoice tracking for small businesses.&rdquo;</em>
  </li>
  <li>
    <strong>Update an existing project</strong> &mdash; Forward or reply to a previous email from me that contains
    your project code (e.g. <code>[PJT-A1B2C3D4]</code>) in the subject line.
  </li>
</ol>
<p>What would you like to do?</p>
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
