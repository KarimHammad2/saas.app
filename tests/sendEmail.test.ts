import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailProvider, getFallbackEmailProvider } from "@/modules/email/providers";
import { sendEmail } from "@/modules/email/sendEmail";

const providerSendEmail = vi.fn();
const fallbackSendEmail = vi.fn();

vi.mock("@/modules/email/providers", () => ({
  getEmailProvider: vi.fn(),
  getFallbackEmailProvider: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedGetEmailProvider = vi.mocked(getEmailProvider);
const mockedGetFallbackEmailProvider = vi.mocked(getFallbackEmailProvider);

describe("sendEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("MASTER_USER_EMAIL", "daniel@saassquared.com");
    mockedGetEmailProvider.mockReturnValue({
      name: "resend",
      validateSignature: vi.fn(() => true),
      parseInbound: vi.fn(),
      sendEmail: providerSendEmail,
    });
    mockedGetFallbackEmailProvider.mockReturnValue(null);
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

  it("falls back to secondary provider after primary retries fail", async () => {
    providerSendEmail.mockRejectedValue(new Error("primary down"));
    fallbackSendEmail.mockResolvedValue(undefined);
    mockedGetFallbackEmailProvider.mockReturnValue({
      name: "ses",
      validateSignature: vi.fn(() => true),
      parseInbound: vi.fn(),
      sendEmail: fallbackSendEmail,
    });

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      text: "Hello",
    });

    expect(providerSendEmail).toHaveBeenCalledTimes(2);
    expect(fallbackSendEmail).toHaveBeenCalledTimes(1);
  });

  it("suppresses the master user from bcc by default", async () => {
    providerSendEmail.mockResolvedValue(undefined);

    await sendEmail({
      to: "user@example.com",
      bcc: "daniel@saassquared.com",
      subject: "Test",
      text: "Hello",
    });

    expect(providerSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["user@example.com"],
        bcc: undefined,
      }),
    );
  });

  it("allows the master user in bcc when explicitly requested", async () => {
    providerSendEmail.mockResolvedValue(undefined);

    await sendEmail({
      to: "user@example.com",
      bcc: "daniel@saassquared.com",
      allowMasterUserInBcc: true,
      subject: "Test",
      text: "Hello",
    });

    expect(providerSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["user@example.com"],
        bcc: ["daniel@saassquared.com"],
      }),
    );
  });
});
