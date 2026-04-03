import { getInboundTriggerEmail } from "@/lib/env";
import { tryNormalizeEmailAddress } from "@/modules/email/emailAddress";

/**
 * Collect participant emails from an inbound message (sender + Cc), excluding the trigger address.
 * We intentionally ignore broad To lists to avoid over-enrolling unrelated recipients.
 */
export function collectParticipantEmailsFromEvent(event: { from: string; to: string[]; cc: string[] }): string[] {
  const trigger = getInboundTriggerEmail().trim().toLowerCase();
  const raw = [event.from, ...event.cc];
  const out: string[] = [];
  for (const r of raw) {
    const n = tryNormalizeEmailAddress(r);
    if (!n) {
      continue;
    }
    if (n === trigger) {
      continue;
    }
    out.push(n);
  }
  return Array.from(new Set(out));
}
