import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { getInboundTriggerEmail, getInternalInboundSenderBlocklist } from "@/lib/env";
import { tryNormalizeEmailAddress } from "@/modules/email/emailAddress";

function normalizeRecipientList(addresses: string[]): string[] {
  const out: string[] = [];
  for (const raw of addresses) {
    const n = tryNormalizeEmailAddress(raw);
    if (n) {
      out.push(n);
    }
  }
  return out;
}

export type InboundPolicyDecision = { ok: true } | { ok: false; reason: string };

/**
 * Project workflow runs only when an external sender explicitly addresses the Frank inbox in To.
 * CC/Bcc do not qualify; internal/system senders are ignored.
 */
export function shouldProcessInboundEmail(event: NormalizedEmailEvent): InboundPolicyDecision {
  const from = tryNormalizeEmailAddress(event.from);
  if (!from) {
    return { ok: false, reason: "invalid_sender" };
  }

  const blocklist = new Set(getInternalInboundSenderBlocklist().map((e) => e.toLowerCase()));
  if (blocklist.has(from)) {
    return { ok: false, reason: "internal_sender" };
  }

  const trigger = getInboundTriggerEmail();
  const toNormalized = normalizeRecipientList(event.to);
  const hasFrankInTo = toNormalized.includes(trigger);

  if (!hasFrankInTo) {
    return { ok: false, reason: "not_addressed_to_frank" };
  }

  return { ok: true };
}
