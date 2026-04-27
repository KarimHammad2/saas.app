import { getDefaultFromEmail, getInboundTriggerEmail } from "@/lib/env";
import type { Tier } from "@/modules/contracts/types";
import { sendEmail } from "@/modules/email/sendEmail";

function escapeHtmlLite(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TIER_ORDER: Record<Tier, number> = {
  freemium: 0,
  solopreneur: 1,
  agency: 2,
};

function formatTierLabel(tier: Tier): string {
  return tier[0].toUpperCase() + tier.slice(1);
}

function isTierUpgrade(previous: Tier, next: Tier): boolean {
  return TIER_ORDER[next] > TIER_ORDER[previous];
}

/**
 * Sent when a system admin updates the user's account tier.
 */
export async function sendUserTierChangedEmail(
  userEmail: string,
  previousTier: Tier,
  newTier: Tier,
): Promise<void> {
  const to = userEmail.trim();
  const fromLabel = formatTierLabel(newTier);
  const wasLabel = formatTierLabel(previousTier);
  const upgrade = isTierUpgrade(previousTier, newTier);
  const frankAddress = getInboundTriggerEmail();

  const leadText = upgrade
    ? `Congratulations! Your SaaS² account is now a ${fromLabel} account.`
    : `Your SaaS² account tier has been updated from ${wasLabel} to ${fromLabel}.`;

  const leadHtml = upgrade
    ? `<p><strong>Congratulations!</strong> Your SaaS&sup2; account is now a <strong>${escapeHtmlLite(fromLabel)}</strong> account.</p>`
    : `<p>Your SaaS&sup2; account tier has been updated from <strong>${escapeHtmlLite(wasLabel)}</strong> to <strong>${escapeHtmlLite(
        fromLabel,
      )}</strong>.</p>`;

  await sendEmail({
    to,
    subject: "Your SaaS² account tier was updated",
    text: [
      "Hello,",
      "",
      leadText,
      "",
      `You can keep working with Frank at ${frankAddress} as usual.`,
      "",
      "— Frank",
    ].join("\n"),
    html: [
      "<p>Hello,</p>",
      leadHtml,
      `<p>You can keep working with Frank at <a href="mailto:${escapeHtmlLite(frankAddress)}">${escapeHtmlLite(
        frankAddress,
      )}</a> as usual.</p>`,
      "<p>&mdash; Frank</p>",
    ].join(""),
    headers: { From: getDefaultFromEmail() },
  });
}
