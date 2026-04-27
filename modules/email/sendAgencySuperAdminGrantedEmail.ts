import { getDefaultFromEmail, getInboundTriggerEmail } from "@/lib/env";
import { sendEmail } from "@/modules/email/sendEmail";

function escapeHtmlLite(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sent when the primary owner confirms adding a delegated agency admin (super admin).
 */
export async function sendAgencySuperAdminGrantedEmail(
  delegateEmail: string,
  primaryAccountEmail: string,
): Promise<void> {
  const frankAddress = getInboundTriggerEmail();
  const primary = primaryAccountEmail.trim();
  await sendEmail({
    to: delegateEmail,
    subject: `You can use agency admin for ${primary}'s account on SaaS²`,
    text: [
      "Hello,",
      "",
      `You have been granted delegated agency admin access on the SaaS² account for ${primary}.`,
      "You can use Frank’s agency admin commands from this email address (same as adding a member, plus admin actions your owner has allowed).",
      "",
      `To get started, email ${frankAddress} with Admin or ask for the agency admin menu.`,
      "",
      "— Frank",
    ].join("\n"),
    html: [
      "<p>Hello,</p>",
      `<p>You have been granted <strong>delegated agency admin</strong> access on the SaaS² account for <strong>${escapeHtmlLite(primary)}</strong>.</p>`,
      "<p>You can use Frank&rsquo;s agency admin commands from this email address.</p>",
      `<p>To get started, email <a href="mailto:${escapeHtmlLite(frankAddress)}">${escapeHtmlLite(frankAddress)}</a> with <strong>Admin</strong> or ask for the agency admin menu.</p>`,
      "<p>&mdash; Frank</p>",
    ].join(""),
    headers: { From: getDefaultFromEmail() },
  });
}
