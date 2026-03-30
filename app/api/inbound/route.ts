import { NextResponse } from "next/server";

import { log } from "@/lib/log";
import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { sendEmail } from "@/modules/email/sendEmail";
import { InboundParseError } from "@/modules/email/parseInbound";
import { shouldProcessInboundEmail } from "@/modules/email/inboundPolicy";
import { getEmailProvider } from "@/modules/email/providers";
import { NonRetryableInboundError, OutboundEmailDeliveryError } from "@/modules/orchestration/errors";
import { handleInboundEmailEvent } from "@/modules/orchestration/handleInboundEmail";

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

type ParsedRequestPayload = {
  payload: Record<string, unknown>;
  contentType: string;
  payloadKeys: string[];
};

function isConfigurationError(error: Error): boolean {
  return (
    error.message.includes("Missing required environment variable:") ||
    error.message.includes("must start with whsec_")
  );
}

function toErrorResponse(
  status: number,
  requestId: string,
  code: string,
  error: string,
  retryable: boolean,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code,
      error,
      requestId,
      retryable,
    },
    {
      status,
      headers: {
        "x-request-id": requestId,
      },
    },
  );
}

async function sendProcessingFallbackEmail(event: NormalizedEmailEvent, requestId: string): Promise<void> {
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

async function parseRequestPayload(request: Request): Promise<ParsedRequestPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new InboundParseError("Request body must be valid JSON.");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new InboundParseError("Request body must be a JSON object.");
    }
    const objectPayload = payload as Record<string, unknown>;
    return {
      payload: objectPayload,
      contentType,
      payloadKeys: Object.keys(objectPayload),
    };
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const payload: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        payload[key] = value;
        continue;
      }
      payload[key] = await value.text();
    }
    return {
      payload,
      contentType,
      payloadKeys: Object.keys(payload),
    };
  }

  throw new InboundParseError("Unsupported content type for inbound payload.");
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  let providerName = "unknown";
  let contentType = request.headers.get("content-type") ?? "";
  let payloadKeys: string[] = [];
  let parsedEvent: NormalizedEmailEvent | null = null;
  const rawBody = await request.clone().text();

  try {
    const provider = getEmailProvider();
    providerName = provider.name;
    const parsedRequest = await parseRequestPayload(request);
    contentType = parsedRequest.contentType;
    payloadKeys = parsedRequest.payloadKeys;
    const envelope = {
      headers: headersToObject(request.headers),
      payload: parsedRequest.payload,
      rawBody,
    };

    if (!provider.validateSignature(envelope)) {
      log.warn("inbound signature validation failed", {
        requestId,
        provider: provider.name,
        contentType,
        payloadKeys,
      });
      return toErrorResponse(401, requestId, "INVALID_SIGNATURE", "Invalid inbound signature.", false);
    }

    const event = await provider.parseInbound(envelope);
    parsedEvent = event;
    log.info("inbound email parsed", {
      requestId,
      provider: provider.name,
      eventId: event.eventId,
      hasSummary: Boolean(event.parsed.summary?.trim()),
      goalsCount: event.parsed.goals.length,
      tasksCount: event.parsed.actionItems.length,
      risksCount: event.parsed.risks.length,
      notesCount: event.parsed.notes.length,
      approvalsCount: event.parsed.approvals.length,
      hasTransaction: Boolean(event.parsed.transactionEvent),
      hasUserProfileContext: Boolean(event.parsed.userProfileContext?.trim()),
      hasRpmSuggestion: Boolean(event.parsed.rpmSuggestion),
    });
    const policy = shouldProcessInboundEmail(event);
    if (!policy.ok) {
      log.info("inbound email skipped by policy", {
        requestId,
        provider: provider.name,
        reason: policy.reason,
        eventId: event.eventId,
      });
      return NextResponse.json(
        {
          ok: true,
          ignored: true,
          reason: policy.reason,
          provider: provider.name,
          eventId: event.eventId,
          requestId,
        },
        {
          status: 200,
          headers: {
            "x-request-id": requestId,
          },
        },
      );
    }

    const processed = await handleInboundEmailEvent(event);

    return NextResponse.json(
      {
        ok: true,
        provider: provider.name,
        userId: processed.userId,
        projectId: processed.projectId,
        eventId: event.eventId,
        duplicate: processed.duplicate,
        requestId,
      },
      {
        status: 200,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    if (error instanceof InboundParseError) {
      log.warn("inbound payload rejected", {
        requestId,
        provider: providerName,
        contentType,
        payloadKeys,
        message: error.message,
      });
      return toErrorResponse(400, requestId, "INVALID_PAYLOAD", error.message, false);
    }

    const err = error instanceof Error ? error : new Error("Unexpected server error.");
    if (err instanceof NonRetryableInboundError) {
      log.warn("inbound route rejected non-retryable event", {
        requestId,
        provider: providerName,
        contentType,
        payloadKeys,
        code: err.code,
        message: err.message,
      });
      return toErrorResponse(err.status, requestId, err.code, err.message, false);
    }

    if (parsedEvent) {
      try {
        await sendProcessingFallbackEmail(parsedEvent, requestId);
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        log.error("fallback email send failed", {
          requestId,
          provider: providerName,
          fallbackMessage,
        });
      }
    }

    if (err instanceof OutboundEmailDeliveryError) {
      return toErrorResponse(503, requestId, "OUTBOUND_DELIVERY_FAILED", "Processing succeeded but delivery failed.", true);
    }

    if (isConfigurationError(err)) {
      log.error("inbound route misconfigured", {
        requestId,
        provider: providerName,
        contentType,
        payloadKeys,
        errorName: err.name,
        message: err.message,
      });
      return toErrorResponse(
        500,
        requestId,
        "CONFIGURATION_ERROR",
        "Inbound webhook is misconfigured on the server.",
        false,
      );
    }

    log.error("inbound route failed", {
      requestId,
      provider: providerName,
      contentType,
      payloadKeys,
      errorName: err.name,
      message: err.message,
      stack: err.stack,
    });
    return toErrorResponse(500, requestId, "PROCESSING_FAILED", "Internal server error.", true);
  }
}
