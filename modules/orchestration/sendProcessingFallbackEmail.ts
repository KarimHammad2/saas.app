import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { sendEmail } from "@/modules/email/sendEmail";

export async function sendProcessingFallbackEmail(event: NormalizedEmailEvent, requestId: string): Promise<void> {
  const subjectPrefix = event.subject?.trim() ? `Re: ${event.subject.trim()}` : "Re: Project update";
  await sendEmail({
    to: event.from,
    subject: `${subjectPrefix} (processing delayed)`,
    text: [
      "We received your email but could not process it fully right now.",
      "",
      "No action is needed yet. Please try replying again shortly.",
      "For best results, use explicit sections: Goals, Tasks, Risks, and Notes.",
      "",
      `Request ID: ${requestId}`,
    ].join("\n"),
  });
}
