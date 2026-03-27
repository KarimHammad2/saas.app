import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sesProvider } from "@/modules/email/providers/sesProvider";

describe("sesProvider.validateSignature", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true for valid HMAC signature", () => {
    vi.stubEnv("SES_WEBHOOK_SECRET", "ses-secret");
    const rawBody = JSON.stringify({ id: "evt_1" });
    const signature = createHmac("sha256", "ses-secret").update(rawBody).digest("hex");

    const valid = sesProvider.validateSignature({
      headers: { "x-ses-signature": signature },
      payload: {},
      rawBody,
    });

    expect(valid).toBe(true);
  });

  it("returns false for missing signature header", () => {
    vi.stubEnv("SES_WEBHOOK_SECRET", "ses-secret");
    const valid = sesProvider.validateSignature({
      headers: {},
      payload: {},
      rawBody: JSON.stringify({ id: "evt_1" }),
    });

    expect(valid).toBe(false);
  });

  it("throws for missing webhook secret configuration", () => {
    const rawBody = JSON.stringify({ id: "evt_1" });
    const signature = createHmac("sha256", "ses-secret").update(rawBody).digest("hex");

    expect(() =>
      sesProvider.validateSignature({
        headers: { "x-ses-signature": signature },
        payload: {},
        rawBody,
      }),
    ).toThrowError("Missing required environment variable: SES_WEBHOOK_SECRET");
  });
});
