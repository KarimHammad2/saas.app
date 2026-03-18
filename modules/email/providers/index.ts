import { resendProvider } from "@/modules/email/providers/resendProvider";
import { sesProvider } from "@/modules/email/providers/sesProvider";
import type { EmailProvider } from "@/modules/email/providers/types";

export function getEmailProvider(): EmailProvider {
  const provider = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  if (provider === "ses") {
    return sesProvider;
  }
  return resendProvider;
}
