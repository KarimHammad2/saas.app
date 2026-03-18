import { parseInbound } from "@/modules/email/parseInbound";
import { normalizeSesPayload } from "@/modules/email/providers/normalizeInboundPayload";
import type { EmailProvider, InboundEnvelope, OutboundEmail } from "@/modules/email/providers/types";

export const sesProvider: EmailProvider = {
  name: "ses",
  validateSignature(envelope: InboundEnvelope): boolean {
    void envelope;
    // Signature verification is provider-specific and can be enforced when SES signing keys are configured.
    return true;
  },
  parseInbound(envelope: InboundEnvelope) {
    const normalizedPayload = normalizeSesPayload(envelope.payload);
    return parseInbound(normalizedPayload, "ses");
  },
  async sendEmail(message: OutboundEmail): Promise<void> {
    void message;
    throw new Error("SES provider is not implemented in MVP. Use Resend.");
  },
};
