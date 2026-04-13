import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { log } from "@/lib/log";
import { MemoryRepository } from "@/modules/memory/repository";
import { ClarificationRequiredError, OutboundEmailDeliveryError } from "@/modules/orchestration/errors";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import { sendClarificationEmail, sendPdfResubmissionEmail } from "@/modules/orchestration/sendClarificationEmail";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";

export async function handleInboundEmailEvent(event: NormalizedEmailEvent) {
  if (event.attachments?.some((attachment) => attachment.isPdf)) {
    log.info("inbound email includes PDF attachment — sending resubmission reply", {
      senderEmail: event.from,
      senderSubject: event.subject,
      attachmentCount: event.attachments.length,
    });
    await sendPdfResubmissionEmail(event.from, event.subject);
    return { userId: null, projectId: null, duplicate: false, clarificationSent: true };
  }

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
    const repo = new MemoryRepository();
    try {
      const { outboundMessageId } = await sendProjectEmail(result.recipients, result.payload);
      await repo.storeOutboundThreadMapping(outboundMessageId, result.context.projectId);
      await repo.recordOutboundEmailEvent({
        projectId: result.context.projectId,
        userId: result.context.userId,
        inboundEventId: result.context.eventId,
        kind: "project-update",
        provider: event.provider,
        status: "sent",
        recipientCount: result.recipients.length,
        messageId: outboundMessageId,
      });
    } catch (error) {
      const causeMessage = error instanceof Error ? error.message : String(error);
      log.error("outbound project email failed", {
        eventId: result.context.eventId,
        projectId: result.context.projectId,
        userId: result.context.userId,
        recipientCount: result.recipients.length,
        causeMessage,
      });
      try {
        await repo.recordOutboundEmailEvent({
          projectId: result.context.projectId,
          userId: result.context.userId,
          inboundEventId: result.context.eventId,
          kind: "project-update",
          provider: event.provider,
          status: "failed",
          recipientCount: result.recipients.length,
          errorMessage: causeMessage,
        });
      } catch (auditError) {
        const auditMessage = auditError instanceof Error ? auditError.message : String(auditError);
        log.error("failed to record outbound email audit event", {
          projectId: result.context.projectId,
          userId: result.context.userId,
          auditMessage,
        });
      }
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
