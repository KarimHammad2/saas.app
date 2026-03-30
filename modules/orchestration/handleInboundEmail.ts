import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { log } from "@/lib/log";
import { OutboundEmailDeliveryError } from "@/modules/orchestration/errors";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";

export async function handleInboundEmailEvent(event: NormalizedEmailEvent) {
  const result = await processInboundEmail(event);
  if (!result.context.duplicate) {
    try {
      await sendProjectEmail(result.recipients, result.payload);
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
  };
}
