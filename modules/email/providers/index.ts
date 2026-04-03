import { getEmailProviderName, getFallbackEmailProviderName, getResendApiKey, getResendWebhookSecret } from "@/lib/env";
import { resendProvider } from "@/modules/email/providers/resendProvider";
import { sesProvider } from "@/modules/email/providers/sesProvider";
import type { EmailProvider } from "@/modules/email/providers/types";

export function getEmailProviderByName(provider: "resend" | "ses"): EmailProvider {
  if (provider === "ses") {
    return sesProvider;
  }
  // Validate required secrets at provider selection time for clear failures.
  getResendApiKey();
  getResendWebhookSecret();
  return resendProvider;
}

export function getEmailProvider(): EmailProvider {
  return getEmailProviderByName(getEmailProviderName());
}

export function getFallbackEmailProvider(primaryProviderName: string): EmailProvider | null {
  const fallback = getFallbackEmailProviderName();
  if (!fallback || fallback === primaryProviderName) {
    return null;
  }
  return getEmailProviderByName(fallback);
}
