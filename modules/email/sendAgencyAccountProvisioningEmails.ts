import { getDefaultFromEmail, getInboundTriggerEmail, getMasterUserEmail } from "@/lib/env";
import { sendEmail } from "@/modules/email/sendEmail";

function escapeHtmlLite(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Combined welcome + Agency tier message for net-new accounts provisioned as agency in one step (no duplicate mails).
 */
export async function sendNewAgencyUserWelcomeCombinedEmail(recipientEmail: string): Promise<void> {
  const frankAddress = getInboundTriggerEmail();

  await sendEmail({
    to: recipientEmail,
    subject: "Welcome to SaaS² — your Agency account is ready",
    text: [
      "Congratulations — your SaaS² account has been created as an Agency account.",
      "",
      `You can start working with Frank. Send an email to ${frankAddress} with what you're building or coordinating, and we'll take it from there.`,
      "",
      "— Frank",
    ].join("\n"),
    html: [
      "<p><strong>Congratulations</strong> — your SaaS&sup2; account has been created as an Agency account.</p>",
      `<p>You can start working with Frank. Send an email to <a href="mailto:${escapeHtmlLite(frankAddress)}">${escapeHtmlLite(
        frankAddress,
      )}</a> with what you&rsquo;re building or coordinating, and we&rsquo;ll take it from there.</p>`,
      "<p>&mdash; Frank</p>",
    ].join(""),
    headers: { From: getDefaultFromEmail() },
  });
}

/** Receipt to MASTER_USER_EMAIL when provisioning an agency account (must allow direct delivery). */
export async function sendMasterAgencyProvisioningReceiptEmail(input: {
  provisionedPrimaryEmail: string;
  scenario: "create_agency_user" | "update_tier_to_agency";
}): Promise<void> {
  const master = getMasterUserEmail();

  let subject: string;
  let summary: string;

  switch (input.scenario) {
    case "create_agency_user":
      subject = "SaaS² — agency account provisioning complete";
      summary = `The Agency account for ${input.provisionedPrimaryEmail.trim()} has been created or promoted. Confirmation has been logged.`;
      break;
    case "update_tier_to_agency":
      subject = "SaaS² — user promoted to Agency";
      summary = `${input.provisionedPrimaryEmail.trim()} was promoted to Agency tier. They have been sent a tier update email when their tier changed.`;
      break;
  }

  await sendEmail({
    to: master,
    allowMasterUserAsDirectRecipient: true,
    subject,
    text: ["Hello,", "", summary, "", "— Frank (system)", ""].join("\n"),
    html: [`<p>Hello,</p><p>${escapeHtmlLite(summary)}</p><p>&mdash; Frank (system)</p>`].join(""),
    headers: { From: getDefaultFromEmail() },
  });
}

