import { Resend } from "resend";
import { getResendApiKey } from "@/lib/env";

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (resendClient) {
    return resendClient;
  }

  resendClient = new Resend(getResendApiKey());

  return resendClient;
}
