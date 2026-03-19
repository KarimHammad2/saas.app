import { getEmailProviderName, getResendApiKey, getResendWebhookSecret } from "@/lib/env";
import { resendProvider } from "@/modules/email/providers/resendProvider";
import { sesProvider } from "@/modules/email/providers/sesProvider";
import type { EmailProvider } from "@/modules/email/providers/types";

export function getEmailProvider(): EmailProvider {
  const provider = getEmailProviderName();
  if (provider === "ses") {
    return sesProvider;
  }
  // Validate required secrets at provider selection time for clear failures.
  getResendApiKey();
  getResendWebhookSecret();
  return resendProvider;
}
