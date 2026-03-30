import { getCronSecret } from "@/lib/env";
import { log } from "@/lib/log";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { MemoryRepository } from "@/modules/memory/repository";
import { NonRetryableInboundError } from "@/modules/orchestration/errors";
import { handleInboundEmailEvent } from "@/modules/orchestration/handleInboundEmail";
import { sendProcessingFallbackEmail } from "@/modules/orchestration/sendProcessingFallbackEmail";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 3;
const MAX_JOBS_PER_RUN = 20;

function authorize(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  try {
    return auth === `Bearer ${getCronSecret()}`;
  } catch {
    return false;
  }
}

function parseNormalizedEmailEvent(payload: Record<string, unknown>): NormalizedEmailEvent {
  const event = payload as Partial<NormalizedEmailEvent>;
  if (
    !event ||
    typeof event !== "object" ||
    typeof event.eventId !== "string" ||
    typeof event.provider !== "string" ||
    typeof event.providerEventId !== "string" ||
    typeof event.timestamp !== "string" ||
    typeof event.from !== "string" ||
    typeof event.subject !== "string" ||
    typeof event.rawBody !== "string" ||
    !event.parsed ||
    typeof event.parsed !== "object"
  ) {
    throw new NonRetryableInboundError("Inbound queued payload is invalid.", {
      code: "INVALID_QUEUED_PAYLOAD",
      status: 422,
    });
  }
  return event as NormalizedEmailEvent;
}

function retryDelaySeconds(attempts: number): number {
  const boundedAttempts = Math.max(1, attempts);
  return Math.min(300, boundedAttempts * boundedAttempts * 15);
}

async function runInboundWorker(): Promise<{ processed: number; retried: number; failed: number; empty: boolean }> {
  const repo = new MemoryRepository();
  let processed = 0;
  let retried = 0;
  let failed = 0;

  for (let index = 0; index < MAX_JOBS_PER_RUN; index += 1) {
    const job = await repo.claimNextInboundEmailJob();
    if (!job) {
      return { processed, retried, failed, empty: index === 0 };
    }

    let event: NormalizedEmailEvent | null = null;
    try {
      event = parseNormalizedEmailEvent(job.payload);
      await handleInboundEmailEvent(event);
      await repo.markInboundEmailProcessed(job.id, job.emailId);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isNonRetryable = error instanceof NonRetryableInboundError;
      const canRetry = !isNonRetryable && job.attempts < MAX_ATTEMPTS;

      if (canRetry) {
        await repo.rescheduleInboundEmailJob(job.id, job.emailId, message, retryDelaySeconds(job.attempts));
        retried += 1;
        continue;
      }

      await repo.markInboundEmailFailed(job.id, job.emailId, message);
      failed += 1;

      if (event) {
        try {
          const shouldSendFallback = await repo.markFallbackEmailSent(job.emailId);
          if (shouldSendFallback) {
            await sendProcessingFallbackEmail(event, job.id);
          }
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          log.error("queued fallback email send failed", {
            jobId: job.id,
            emailId: job.emailId,
            fallbackMessage,
          });
        }
      }
    }
  }

  return { processed, retried, failed, empty: false };
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runInboundWorker();
  return Response.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runInboundWorker();
  return Response.json({ ok: true, ...result });
}
