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

async function parseRequestPayload(request: Request): Promise<Record<string, unknown>> {
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
    return payload as Record<string, unknown>;
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const payload: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      payload[key] = typeof value === "string" ? value : "";
    }
    return payload;
  }

  throw new InboundParseError("Unsupported content type for inbound payload.");
}

export async function POST(request: Request) {
  try {
    const provider = getEmailProvider();
    const payload = await parseRequestPayload(request);
    const envelope = {
      headers: headersToObject(request.headers),
      payload,
    };

    if (!provider.validateSignature(envelope)) {
      return NextResponse.json({ ok: false, error: "Invalid inbound signature." }, { status: 401 });
    }

    const event = provider.parseInbound(envelope);
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
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof InboundParseError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    log.error("inbound route failed", { message });

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
