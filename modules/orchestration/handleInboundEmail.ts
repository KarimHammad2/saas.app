import { getDefaultFromEmail } from "@/lib/env";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { log } from "@/lib/log";
import { sendEmail } from "@/modules/email/sendEmail";
import { MemoryRepository } from "@/modules/memory/repository";
import { CcMembershipConfirmationRequiredError, ClarificationRequiredError, OutboundEmailDeliveryError } from "@/modules/orchestration/errors";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import {
  sendCcMembershipConfirmationEmail,
  sendClarificationEmail,
  sendPdfResubmissionEmail,
  sendRpmStructuredProjectClarificationEmail,
} from "@/modules/orchestration/sendClarificationEmail";
import {
  sendPaymentConfirmedEmail,
  sendPaymentInstructionsEmail,
} from "@/modules/output/paymentOutbound";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";
import { sendRpmProfileProposalEmail } from "@/modules/output/sendRpmProfileProposalEmail";

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
    if (error instanceof CcMembershipConfirmationRequiredError) {
      log.info("cc membership confirmation required — sending owner prompt", {
        ownerEmail: error.ownerEmail,
        senderSubject: error.senderSubject,
        candidateEmails: error.candidateEmails,
        confirmationId: error.confirmationId,
      });
      await sendCcMembershipConfirmationEmail({
        recipientEmail: error.ownerEmail,
        originalSubject: error.senderSubject,
        candidateEmails: error.candidateEmails,
      });
      return { userId: null, projectId: null, duplicate: false, clarificationSent: true };
    }
    if (error instanceof ClarificationRequiredError) {
      log.info("inbound intent too vague — sending clarification reply", {
        senderEmail: error.senderEmail,
        senderSubject: error.senderSubject,
        intentReason: error.intentReason,
        clarificationKind: error.clarificationKind,
      });
      if (error.clarificationKind === "rpm_structured_project") {
        await sendRpmStructuredProjectClarificationEmail(error.senderEmail, error.senderSubject);
      } else {
        await sendClarificationEmail(error.senderEmail, error.senderSubject);
      }
      return { userId: null, projectId: null, duplicate: false, clarificationSent: true };
    }
    throw error;
  }

  if (!result.context.duplicate) {
    const repo = new MemoryRepository();
    const payload = result.payload;
    if (result.escalationAction) {
      if (result.escalationAction.notification) {
        await repo.recordOutboundEmailEvent({
          projectId: result.context.projectId,
          userId: result.context.userId,
          inboundEventId: result.context.eventId,
          kind: result.escalationAction.type === "Approval" ? "approval-request" : "escalation-rpm",
          provider: event.provider,
          status: "sent",
          recipientCount: result.escalationAction.notification.recipients.length,
        });
      }
      return {
        userId: result.context.userId,
        projectId: result.context.projectId,
        duplicate: result.context.duplicate,
        clarificationSent: false,
      };
    }
    if (!result.adminReply && !payload) {
      throw new Error("Missing project payload for non-admin inbound response.");
    }
    const resolvedProjectId = result.context.projectId ?? payload?.context.projectId ?? null;
    const withLastContactAt = (payloadInput: NonNullable<typeof result.payload>, lastContactAt: string) => ({
      ...payloadInput,
      context: {
        ...payloadInput.context,
        lastContactAt,
      },
    });
    try {
      const ownerEmail = payload?.context.ownerEmail?.trim();
      if (result.adminReply) {
        await sendEmail({
          to: result.recipients.join(", "),
          subject: result.adminReply.subject,
          text: result.adminReply.text,
          html: result.adminReply.html,
          allowMasterUserAsDirectRecipient: true,
          headers: { From: getDefaultFromEmail() },
        });
        await repo.recordOutboundEmailEvent({
          projectId: result.context.projectId,
          userId: result.context.userId,
          inboundEventId: result.context.eventId,
          kind: "admin-response",
          provider: event.provider,
          status: "sent",
          recipientCount: result.recipients.length,
        });
      } else if (result.outboundMode === "rpm_profile_proposal" && result.rpmProfileProposal && ownerEmail && payload) {
        const { outboundMessageId } = await sendRpmProfileProposalEmail({
          ownerEmail,
          context: payload.context,
          suggestion: result.rpmProfileProposal,
        });
        const projectId = payload.context.projectId;
        await repo.updateProjectLastContactAt(projectId);
        await repo.storeOutboundThreadMapping(outboundMessageId, projectId);
        await repo.recordOutboundEmailEvent({
          projectId,
          userId: result.context.userId,
          inboundEventId: result.context.eventId,
          kind: "rpm-profile-proposal",
          provider: event.provider,
          status: "sent",
          recipientCount: 1,
          messageId: outboundMessageId,
        });
      } else {
        if (!payload) {
          throw new Error("Missing project payload for full project email outbound.");
        }
        const lastContactAt = new Date().toISOString();
        const { outboundMessageIds } = await sendProjectEmail(
          result.recipients,
          withLastContactAt(payload, lastContactAt),
        );
        if (resolvedProjectId) {
          await repo.updateProjectLastContactAt(resolvedProjectId, lastContactAt);
        }
        for (const messageId of outboundMessageIds) {
          if (resolvedProjectId) {
            await repo.storeOutboundThreadMapping(messageId, resolvedProjectId);
          }
        }
        await repo.recordOutboundEmailEvent({
          projectId: result.context.projectId,
          userId: result.context.userId,
          inboundEventId: result.context.eventId,
          kind: "project-update",
          provider: event.provider,
          status: "sent",
          recipientCount: result.recipients.length,
          messageId: outboundMessageIds[0],
        });
      }

      if (result.paymentInstructions) {
        const pi = result.paymentInstructions;
        const instructionIds = await sendPaymentInstructionsEmail(pi);
        if (resolvedProjectId) {
          await repo.updateProjectLastContactAt(resolvedProjectId);
        }
        for (const messageId of instructionIds) {
          if (resolvedProjectId) {
            await repo.storeOutboundThreadMapping(messageId, resolvedProjectId);
          }
          await repo.recordOutboundEmailEvent({
            projectId: result.context.projectId,
            userId: result.context.userId,
            inboundEventId: result.context.eventId,
            kind: "payment-instructions",
            provider: event.provider,
            status: "sent",
            recipientCount: pi.recipients.length,
            messageId,
          });
        }
      }

      if (result.paymentConfirmed) {
        const pc = result.paymentConfirmed;
        const paymentProjectId = result.context.projectId ?? pc.followUpProjectPayload.context.projectId;
        const confirmedIds = await sendPaymentConfirmedEmail({
          recipients: pc.recipients,
          activeRpmEmail: pc.followUpProjectPayload.context.activeRpmEmail ?? null,
          plainTextBody: pc.plainTextBody,
        });
        await repo.updateProjectLastContactAt(paymentProjectId);
        for (const messageId of confirmedIds) {
          await repo.storeOutboundThreadMapping(messageId, paymentProjectId);
          await repo.recordOutboundEmailEvent({
            projectId: result.context.projectId,
            userId: result.context.userId,
            inboundEventId: result.context.eventId,
            kind: "payment-confirmed",
            provider: event.provider,
            status: "sent",
            recipientCount: pc.recipients.length,
            messageId,
          });
        }
        const followUpLastContactAt = new Date().toISOString();
        const { outboundMessageIds: followUpIds } = await sendProjectEmail(
          pc.recipients,
          withLastContactAt(pc.followUpProjectPayload, followUpLastContactAt),
        );
        await repo.updateProjectLastContactAt(paymentProjectId, followUpLastContactAt);
        for (const messageId of followUpIds) {
          await repo.storeOutboundThreadMapping(messageId, paymentProjectId);
        }
        await repo.recordOutboundEmailEvent({
          projectId: result.context.projectId,
          userId: result.context.userId,
          inboundEventId: result.context.eventId,
          kind: "payment-confirmed-followup",
          provider: event.provider,
          status: "sent",
          recipientCount: pc.recipients.length,
          messageId: followUpIds[0],
        });
      }
    } catch (error) {
      const causeMessage = error instanceof Error ? error.message : String(error);
      log.error("outbound project email failed", {
        eventId: result.context.eventId,
        projectId: result.context.projectId,
        userId: result.context.userId,
        recipientCount:
          result.adminReply ? result.recipients.length : result.outboundMode === "rpm_profile_proposal" ? 1 : result.recipients.length,
        causeMessage,
      });
      try {
        await repo.recordOutboundEmailEvent({
          projectId: result.context.projectId,
          userId: result.context.userId,
          inboundEventId: result.context.eventId,
          kind: result.adminReply
            ? "admin-response"
            : result.outboundMode === "rpm_profile_proposal"
              ? "rpm-profile-proposal"
              : "project-update",
          provider: event.provider,
          status: "failed",
          recipientCount:
            result.adminReply ? result.recipients.length : result.outboundMode === "rpm_profile_proposal" ? 1 : result.recipients.length,
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
