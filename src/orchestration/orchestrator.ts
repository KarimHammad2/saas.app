import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { parseInbound } from "@/modules/email/parseInbound";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";

function cleanBody(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface HandleIncomingEmailResult {
  userId: string;
  projectId: string;
  duplicate?: boolean;
}

async function processCanonicalEvent(event: NormalizedEmailEvent): Promise<HandleIncomingEmailResult> {
  const result = await processInboundEmail(event);
  await sendProjectEmail(result.recipients, result.payload);
  return {
    userId: result.context.userId,
    projectId: result.context.projectId,
    duplicate: result.context.duplicate,
  };
}

export async function handleIncomingEmail(emailPayload: {
  senderEmail: string;
  subject: string;
  body: string;
  rawInput?: string;
}): Promise<HandleIncomingEmailResult> {
  const body = cleanBody(emailPayload.body);
  const event = parseInbound(
    {
      from: emailPayload.senderEmail,
      subject: emailPayload.subject,
      text: body,
      body: emailPayload.rawInput?.trim() || body,
    },
    "legacy",
  );
  return processCanonicalEvent(event);
}
