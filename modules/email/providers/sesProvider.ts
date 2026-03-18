import { parseInbound } from "@/modules/email/parseInbound";
import type { EmailProvider, InboundEnvelope, OutboundEmail } from "@/modules/email/providers/types";

export const sesProvider: EmailProvider = {
  name: "ses",
  validateSignature(envelope: InboundEnvelope): boolean {
    void envelope;
    return false;
  },
  parseInbound(envelope: InboundEnvelope) {
    return parseInbound(envelope.payload, "ses");
  },
  async sendEmail(message: OutboundEmail): Promise<void> {
    void message;
    throw new Error("SES provider is not implemented in MVP. Use Resend.");
  },
};
