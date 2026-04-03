import { NextResponse } from "next/server";

import { log } from "@/lib/log";
import { InboundParseError } from "@/modules/email/parseInbound";
import { shouldProcessInboundEmail } from "@/modules/email/inboundPolicy";
import { getEmailProvider } from "@/modules/email/providers";
import { MemoryRepository } from "@/modules/memory/repository";

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

function extractProviderEventType(payload: Record<string, unknown>): string {
  const direct = typeof payload.type === "string" ? payload.type : "";
  if (direct) {
    return direct.trim().toLowerCase();
  }
  const nestedData = payload.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    const nestedType = (nestedData as Record<string, unknown>).type;
    if (typeof nestedType === "string") {
      return nestedType.trim().toLowerCase();
    }
  }
  return "";
}

function extractProviderMessageId(payload: Record<string, unknown>): string | null {
  const direct = typeof payload.id === "string" ? payload.id.trim() : "";
  if (direct) {
    return direct;
  }
  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const candidates = [d.email_id, d.message_id, d.id];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) {
        return c.trim();
      }
    }
  }
  return null;
}

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
  const repo = new MemoryRepository();
  let providerName = "unknown";
  let contentType = request.headers.get("content-type") ?? "";
  let payloadKeys: string[] = [];
  const rawBody = await request.clone().text();

  try {
    const provider = getEmailProvider();
    providerName = provider.name;
    const parsedRequest = await parseRequestPayload(request);
    contentType = parsedRequest.contentType;
    payloadKeys = parsedRequest.payloadKeys;
    const providerEventType = extractProviderEventType(parsedRequest.payload);
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

    if (providerEventType.includes("bounced") || providerEventType.includes("failed")) {
      const providerMessageId = extractProviderMessageId(parsedRequest.payload);
      log.warn("provider delivery failure event received", {
        requestId,
        provider: provider.name,
        providerEventType,
        providerMessageId,
      });
      await repo.recordOutboundEmailEvent({
        kind: "provider-delivery-event",
        provider: provider.name,
        status: "failed",
        recipientCount: 0,
        messageId: providerMessageId,
        errorMessage: providerEventType,
      });
      return NextResponse.json(
        {
          ok: true,
          ignored: true,
          reason: "provider_delivery_failure_event",
          provider: provider.name,
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

    const event = await provider.parseInbound(envelope);
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

    const dedupeEmailId = event.providerEventId?.trim();
    if (!dedupeEmailId) {
      throw new InboundParseError("Inbound payload is missing provider event id.");
    }
    const queued = await repo.enqueueInboundEmailJob(dedupeEmailId, provider.name, event as unknown as Record<string, unknown>);

    return NextResponse.json(
      {
        ok: true,
        provider: provider.name,
        eventId: event.eventId,
        emailId: dedupeEmailId,
        queued,
        skipped: !queued,
        duplicate: !queued,
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
