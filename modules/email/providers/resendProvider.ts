import { getDefaultFromEmail, getResendWebhookSecret } from "@/lib/env";
import { log } from "@/lib/log";
import { getResendClient } from "@/lib/resend";
import { parseInbound } from "@/modules/email/parseInbound";
import { normalizeResendPayload } from "@/modules/email/providers/normalizeInboundPayload";
import type { EmailProvider, InboundEnvelope, OutboundEmail } from "@/modules/email/providers/types";
import { createHmac, timingSafeEqual } from "node:crypto";

type UnknownObject = Record<string, unknown>;

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasBodyContent(payload: UnknownObject): boolean {
  const candidates = [
    payload.text,
    payload.html,
    payload.message,
    payload.body,
    payload.content,
    payload.TextBody,
    payload.HtmlBody,
    payload["stripped-text"],
    payload["stripped-html"],
  ];
  return candidates.some((value) => textValue(value).length > 0);
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
  return strings.length > 0 ? strings : undefined;
}

async function hydrateResendBodyIfNeeded(payload: UnknownObject): Promise<UnknownObject> {
  if (hasBodyContent(payload)) {
    return payload;
  }

  const emailId = textValue(payload.email_id) || textValue(payload.id) || textValue(payload.messageId);
  if (!emailId) {
    return payload;
  }

  const resend = getResendClient() as unknown as {
    emails?: {
      receiving?: {
        get?: (id: string) => Promise<{ data?: UnknownObject | null; error?: { message?: string } | null }>;
      };
    };
  };

  const receivingClient = resend.emails?.receiving;
  if (!receivingClient?.get) {
    return payload;
  }

  try {
    const result = await receivingClient.get(emailId);
    if (!result || result.error || !result.data) {
      log.warn("resend receiving retrieval failed", {
        emailId,
        message: result?.error?.message ?? "unknown retrieval error",
      });
      return payload;
    }

    const received = result.data;
    return {
      ...payload,
      from: payload.from ?? received.from,
      subject: payload.subject ?? received.subject,
      text: payload.text ?? received.text,
      html: payload.html ?? received.html,
      body: payload.body ?? received.text,
      message: payload.message ?? received.text,
      to: payload.to ?? toStringArray(received.to),
      cc: payload.cc ?? toStringArray(received.cc),
      messageId: payload.messageId ?? received.message_id,
      email_id: payload.email_id ?? received.id ?? emailId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown retrieval exception";
    log.warn("resend receiving retrieval threw", { emailId, message });
    return payload;
  }
}

function parseSvixSignatures(signatureHeader: string): string[] {
  return signatureHeader
    .split(" ")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((segment) => {
      const [version, value] = segment.split(",", 2);
      if (version !== "v1" || !value) {
        return [];
      }
      return [value];
    });
}

function decodeWebhookSecret(secret: string): Buffer {
  const cleaned = secret.trim();
  if (!cleaned.startsWith("whsec_")) {
    throw new Error("RESEND_WEBHOOK_SECRET must start with whsec_.");
  }
  return Buffer.from(cleaned.slice("whsec_".length), "base64");
}

function validateSvixSignature(envelope: InboundEnvelope): boolean {
  const svixId = envelope.headers["svix-id"];
  const svixTimestamp = envelope.headers["svix-timestamp"];
  const svixSignature = envelope.headers["svix-signature"];
  const rawBody = envelope.rawBody ?? "";

  if (!svixId || !svixTimestamp || !svixSignature || !rawBody) {
    return false;
  }

  const secret = decodeWebhookSecret(getResendWebhookSecret());
  const signedContent = `${svixTimestamp}.${svixId}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedContent).digest("base64");
  const expectedBuffer = Buffer.from(expected);

  const providedSignatures = parseSvixSignatures(svixSignature);
  if (providedSignatures.length === 0) {
    return false;
  }

  return providedSignatures.some((signature) => {
    const candidate = Buffer.from(signature);
    if (candidate.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(candidate, expectedBuffer);
  });
}

export const resendProvider: EmailProvider = {
  name: "resend",
  validateSignature(envelope: InboundEnvelope): boolean {
    try {
      return validateSvixSignature(envelope);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown signature validation error";
      log.error("resend signature verification failed", { message });
      return false;
    }
  },
  async parseInbound(envelope: InboundEnvelope) {
    const normalizedPayload = normalizeResendPayload(envelope.payload);
    const hydratedPayload = await hydrateResendBodyIfNeeded(normalizedPayload);
    return parseInbound(hydratedPayload, "resend");
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
