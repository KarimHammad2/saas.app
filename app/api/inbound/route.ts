import { NextResponse } from "next/server";

import { log } from "@/lib/log";
import { InboundParseError } from "@/modules/email/parseInbound";
import { getEmailProvider } from "@/modules/email/providers";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";
import { processInboundEmail } from "@/modules/orchestration/processInboundEmail";

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
    const processed = await processInboundEmail(event);
    await sendProjectEmail(processed.recipients, processed.payload);

    return NextResponse.json(
      {
        ok: true,
        provider: provider.name,
        userId: processed.context.userId,
        projectId: processed.context.projectId,
        eventId: processed.context.eventId,
        duplicate: processed.context.duplicate,
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
