import { getDefaultFromEmail, getInboundTriggerEmail } from "@/lib/env";
import { sendEmail } from "@/modules/email/sendEmail";

/**
 * Sent when the master admin creates a new user account (admin `create_user` action).
 */
export async function sendNewUserWelcomeEmail(recipientEmail: string): Promise<void> {
  const frankAddress = getInboundTriggerEmail();
  const subject = "Welcome to SaaS² — your account is ready";

  const text = [
    "Congratulations — your SaaS² account has been created.",
    "",
    `You can start working with Frank. Send an email to ${frankAddress} with what you want to build or what you're working on, and we'll take it from there.`,
    "",
    "— Frank",
  ].join("\n");

  const html = `
<p>Congratulations &mdash; your SaaS&sup2; account has been created.</p>
<p>You can start working with Frank. Send an email to <a href="mailto:${frankAddress}">${frankAddress}</a> with what you want to build or what you&rsquo;re working on, and we&rsquo;ll take it from there.</p>
<p>&mdash; Frank</p>
`.trim();

  await sendEmail({
    to: recipientEmail,
    subject,
    text,
    html,
    headers: { From: getDefaultFromEmail() },
  });
}
