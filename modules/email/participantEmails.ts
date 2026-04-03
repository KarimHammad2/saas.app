import { getInboundTriggerEmail } from "@/lib/env";
import { tryNormalizeEmailAddress } from "@/modules/email/emailAddress";

/**
 * Collect participant emails from an inbound message (sender + To + Cc), excluding the Frank trigger address.
 */
export function collectParticipantEmailsFromEvent(event: { from: string; to: string[]; cc: string[] }): string[] {
  const trigger = getInboundTriggerEmail().trim().toLowerCase();
  const raw = [event.from, ...event.to, ...event.cc];
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
