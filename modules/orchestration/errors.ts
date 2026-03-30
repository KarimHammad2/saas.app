export class NonRetryableInboundError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = "NonRetryableInboundError";
    this.code = options?.code ?? "INBOUND_REJECTED";
    this.status = options?.status ?? 422;
  }
}

export class OutboundEmailDeliveryError extends Error {
  readonly recipients: string[];
  readonly causeMessage: string;

  constructor(message: string, options: { recipients: string[]; causeMessage: string }) {
    super(message);
    this.name = "OutboundEmailDeliveryError";
    this.recipients = options.recipients;
    this.causeMessage = options.causeMessage;
  }
}
