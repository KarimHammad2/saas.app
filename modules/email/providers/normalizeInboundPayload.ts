type UnknownObject = Record<string, unknown>;

function toObject(value: unknown): UnknownObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownObject;
}

function parseJsonObject(value: unknown): UnknownObject | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return toObject(parsed);
  } catch {
    return null;
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const first = value.find((item) => typeof item === "string" && item.trim()) as string | undefined;
  return first?.trim();
}

function objectOrRoot(root: UnknownObject, key: string): UnknownObject {
  const nested = toObject(root[key]);
  return nested ?? root;
}

export function normalizeResendPayload(payload: UnknownObject): UnknownObject {
  const root = toObject(payload) ?? {};
  const source = objectOrRoot(root, "data");

  return {
    id: root.id ?? source.id ?? source.email_id ?? root.email_id,
    from: source.from ?? root.from ?? source.sender ?? root.sender,
    sender: source.sender ?? root.sender ?? source.from ?? root.from,
    subject: source.subject ?? root.subject,
    text: source.text ?? root.text ?? source["stripped-text"] ?? root["stripped-text"] ?? source.message ?? root.message,
    html: source.html ?? root.html ?? source["stripped-html"] ?? root["stripped-html"],
    message: source.message ?? root.message ?? source.content ?? root.content,
    body: source.body ?? root.body,
    content: source.content ?? root.content,
    to: source.to ?? root.to,
    cc: source.cc ?? root.cc,
    messageId: source.messageId ?? root.messageId ?? source["Message-Id"] ?? root["Message-Id"] ?? source.message_id ?? root.message_id ?? source.email_id,
    email_id: source.email_id ?? root.email_id ?? root.id,
    attachments: source.attachments ?? root.attachments,
    files: source.files ?? root.files,
    type: root.type,
  };
}

export function normalizeSesPayload(payload: UnknownObject): UnknownObject {
  const root = toObject(payload) ?? {};
  const snsMessage = parseJsonObject(root.Message);
  const source = snsMessage ?? root;
  const mail = toObject(source.mail) ?? {};
  const commonHeaders = toObject(mail.commonHeaders) ?? {};

  const from = firstString(commonHeaders.from) ?? stringOrUndefined(mail.source) ?? stringOrUndefined(source.from);

  return {
    id: source.id ?? mail.messageId ?? source.messageId,
    from,
    sender: from ?? source.sender,
    subject: stringOrUndefined(commonHeaders.subject) ?? stringOrUndefined(source.subject),
    text:
      stringOrUndefined(source.text) ??
      stringOrUndefined(source["stripped-text"]) ??
      stringOrUndefined(source.content) ??
      stringOrUndefined(source.body),
    html: stringOrUndefined(source.html) ?? stringOrUndefined(source["stripped-html"]),
    message: stringOrUndefined(source.message) ?? stringOrUndefined(source.Message),
    body: stringOrUndefined(source.body) ?? stringOrUndefined(source.Body),
    content: stringOrUndefined(source.content),
    to: commonHeaders.to ?? source.to ?? mail.destination,
    cc: commonHeaders.cc ?? source.cc,
    messageId: mail.messageId ?? source.messageId ?? source["Message-Id"],
    attachments: source.attachments ?? root.attachments,
    files: source.files ?? root.files,
  };
}
