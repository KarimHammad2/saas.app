import { getDefaultFromEmail } from "@/lib/env";
import { getResendClient } from "@/lib/resend";
import { parseInbound } from "@/modules/email/parseInbound";
import { normalizeResendPayload } from "@/modules/email/providers/normalizeInboundPayload";
import type { EmailProvider, InboundEnvelope, OutboundEmail } from "@/modules/email/providers/types";

export const resendProvider: EmailProvider = {
  name: "resend",
  validateSignature(envelope: InboundEnvelope): boolean {
    void envelope;
    // Resend inbound validation can be added here if/when webhook signing is enabled.
    return true;
  },
  parseInbound(envelope: InboundEnvelope) {
    const normalizedPayload = normalizeResendPayload(envelope.payload);
    return parseInbound(normalizedPayload, "resend");
  },
  async sendEmail(message: OutboundEmail): Promise<void> {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: getDefaultFromEmail(),
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (error) {
      throw new Error(`Failed to send email with Resend: ${error.message}`);
    }
  },
};
