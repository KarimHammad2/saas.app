import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailProvider } from "@/modules/email/providers";
import { sendEmail } from "@/modules/email/sendEmail";

const providerSendEmail = vi.fn();

vi.mock("@/modules/email/providers", () => ({
  getEmailProvider: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedGetEmailProvider = vi.mocked(getEmailProvider);

describe("sendEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetEmailProvider.mockReturnValue({
      name: "resend",
      validateSignature: vi.fn(() => true),
      parseInbound: vi.fn(),
      sendEmail: providerSendEmail,
    });
  });

  it("retries once after transient failure", async () => {
    providerSendEmail.mockRejectedValueOnce(new Error("temporary outage")).mockResolvedValueOnce(undefined);

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      text: "Hello",
    });

    expect(providerSendEmail).toHaveBeenCalledTimes(2);
  });

  it("throws after max retry attempts", async () => {
    providerSendEmail.mockRejectedValue(new Error("permanent failure"));

    await expect(
      sendEmail({
        to: "user@example.com",
        subject: "Test",
        text: "Hello",
      }),
    ).rejects.toThrow("permanent failure");

    expect(providerSendEmail).toHaveBeenCalledTimes(2);
  });
});
