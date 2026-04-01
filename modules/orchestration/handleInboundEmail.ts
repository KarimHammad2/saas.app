import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { log } from "@/lib/log";
import { MemoryRepository } from "@/modules/memory/repository";
import { ClarificationRequiredError, OutboundEmailDeliveryError } from "@/modules/orchestration/errors";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import { sendClarificationEmail } from "@/modules/orchestration/sendClarificationEmail";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";

export async function handleInboundEmailEvent(event: NormalizedEmailEvent) {
  let result;
  try {
    result = await processInboundEmail(event);
  } catch (error) {
    if (error instanceof ClarificationRequiredError) {
      log.info("inbound intent too vague — sending clarification reply", {
        senderEmail: error.senderEmail,
        senderSubject: error.senderSubject,
        intentReason: error.intentReason,
      });
      await sendClarificationEmail(error.senderEmail, error.senderSubject);
      return { userId: null, projectId: null, duplicate: false, clarificationSent: true };
    }
    throw error;
  }

  if (!result.context.duplicate) {
    try {
      const { outboundMessageId } = await sendProjectEmail(result.recipients, result.payload);
      const repo = new MemoryRepository();
      await repo.storeOutboundThreadMapping(outboundMessageId, result.context.projectId);
    } catch (error) {
      const causeMessage = error instanceof Error ? error.message : String(error);
      log.error("outbound project email failed", {
        eventId: result.context.eventId,
        projectId: result.context.projectId,
        userId: result.context.userId,
        recipientCount: result.recipients.length,
        causeMessage,
      });
      throw new OutboundEmailDeliveryError("Failed to deliver outbound project email.", {
        recipients: result.recipients,
        causeMessage,
      });
    }
  }
  return {
    userId: result.context.userId,
    projectId: result.context.projectId,
    duplicate: result.context.duplicate,
    clarificationSent: false,
  };
}
