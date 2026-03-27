import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";

export async function handleInboundEmailEvent(event: NormalizedEmailEvent) {
  const result = await processInboundEmail(event);
  if (!result.context.duplicate) {
    await sendProjectEmail(result.recipients, result.payload);
  }
  return {
    userId: result.context.userId,
    projectId: result.context.projectId,
    duplicate: result.context.duplicate,
  };
}
