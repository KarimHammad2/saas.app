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
