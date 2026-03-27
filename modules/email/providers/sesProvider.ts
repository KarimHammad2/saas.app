import { getSesWebhookSecret } from "@/lib/env";
import { parseInbound } from "@/modules/email/parseInbound";
import { normalizeSesPayload } from "@/modules/email/providers/normalizeInboundPayload";
import type { EmailProvider, InboundEnvelope, OutboundEmail } from "@/modules/email/providers/types";
import { createHmac, timingSafeEqual } from "node:crypto";

function normalizeSignature(value: string): string {
  return value.trim().toLowerCase();
}

function validateSesSignature(envelope: InboundEnvelope): boolean {
  const headerSignature = envelope.headers["x-ses-signature"];
  const rawBody = envelope.rawBody ?? "";

  if (!headerSignature || !rawBody) {
    return false;
  }

  const expectedSignature = createHmac("sha256", getSesWebhookSecret()).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(normalizeSignature(expectedSignature));
  const providedBuffer = Buffer.from(normalizeSignature(headerSignature));
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export const sesProvider: EmailProvider = {
  name: "ses",
  validateSignature(envelope: InboundEnvelope): boolean {
    return validateSesSignature(envelope);
  },
  parseInbound(envelope: InboundEnvelope) {
    const normalizedPayload = normalizeSesPayload(envelope.payload);
    return parseInbound(normalizedPayload, "ses");
  },
  async sendEmail(message: OutboundEmail): Promise<void> {
    void message;
    throw new Error("SES outbound is not implemented for MVP. Use Resend.");
  },
};
