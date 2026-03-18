import type { NormalizedEmailEvent } from "@/modules/contracts/types";

export interface InboundEnvelope {
  headers: Record<string, string>;
  payload: Record<string, unknown>;
}

export interface OutboundEmail {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  name: string;
  validateSignature(envelope: InboundEnvelope): boolean;
  parseInbound(envelope: InboundEnvelope): NormalizedEmailEvent;
  sendEmail(message: OutboundEmail): Promise<void>;
}
