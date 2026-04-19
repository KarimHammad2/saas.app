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

/**
 * Thrown when an inbound email lacks sufficient intent to create a new project.
 * Caught by handleInboundEmailEvent to send a clarification reply instead.
 */
export type ClarificationKind = "default" | "rpm_structured_project";

export class ClarificationRequiredError extends Error {
  readonly senderEmail: string;
  readonly senderSubject: string;
  readonly intentReason: string;
  readonly clarificationKind: ClarificationKind;

  constructor(
    message: string,
    options: { senderEmail: string; senderSubject: string; intentReason: string; clarificationKind?: ClarificationKind },
  ) {
    super(message);
    this.name = "ClarificationRequiredError";
    this.senderEmail = options.senderEmail;
    this.senderSubject = options.senderSubject;
    this.intentReason = options.intentReason;
    this.clarificationKind = options.clarificationKind ?? "default";
  }
}

export class CcMembershipConfirmationRequiredError extends Error {
  readonly ownerEmail: string;
  readonly senderSubject: string;
  readonly candidateEmails: string[];
  readonly confirmationId: string;

  constructor(message: string, options: { ownerEmail: string; senderSubject: string; candidateEmails: string[]; confirmationId: string }) {
    super(message);
    this.name = "CcMembershipConfirmationRequiredError";
    this.ownerEmail = options.ownerEmail;
    this.senderSubject = options.senderSubject;
    this.candidateEmails = options.candidateEmails;
    this.confirmationId = options.confirmationId;
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
