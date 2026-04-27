import type { ProjectEmailPayload } from "@/modules/output/types";
import { formatHourlyRateForEmail } from "@/modules/output/checkoutCurrencyDisplay";

export interface FormattedProjectEmail {
  subject: string;
  body: string;
}

function resolveBaseSubject(payload: ProjectEmailPayload): string {
  const isKickoff = payload.emailKind ? payload.emailKind === "kickoff" : payload.isWelcome;
  return isKickoff ? "Your project has been initialized" : "Project Update";
}

const RPM_UPDATE_GUIDE = `
Here is your updated project file (assigned RPM copy).

If you use an LLM to review progress, attach this project file.

To send updates by email:
1) Reply in this thread.
2) Keep the project code in the subject line.
3) Use plain-text blocks with one of these headers:

- Correction: or RPM Correction:
  Correct facts, deadlines, or priorities.
  These updates are applied as RPM input.

- Goals:, Tasks:, Completed:, Risks:, Decisions:, Notes:
  Send structured project updates (same format as the primary contact).

- UserProfile Suggestion:
  Propose profile changes for the account owner.
  The owner approves or rejects these in project email.
`.trim();

const DEFAULT_OWNER_BODY = `
We've attached your latest project file—this is the LLM operating context for your work.

Now: open the chat where you work (Copilot, Gemini, or another assistant).

Next: drag the attachment from this email into that chat, or into the file area if your app shows one.

Then say what you want to do next—a task, a question, or a change.

In a new chat, drag the file in again so context stays in sync, or get a fresh export from the app when the project has changed.
`.trim();

function formatRecordedTransactionBlock(payload: ProjectEmailPayload): string {
  const r = payload.recordedTransaction;
  if (!r) {
    return "";
  }
  const e = r.event;
  const rateLabel = formatHourlyRateForEmail(e.hourlyRate, r.paymentCurrency);
  const lines = [
    "Transaction recorded",
    "",
    "Financial Summary:",
    `- Hours Purchased: ${e.hoursPurchased}`,
    `- Rate: ${rateLabel}`,
    `- Allocated: ${e.allocatedHours}`,
    `- Buffer: ${e.bufferHours}`,
    "",
    `Remainder Balance: ${r.remainderBalance}`,
  ];
  return lines.join("\n");
}

/**
 * Minimal human-facing email: full project state lives in the markdown attachment only.
 */
export function formatProjectEmail(payload: ProjectEmailPayload): FormattedProjectEmail {
  const txBlock = formatRecordedTransactionBlock(payload);
  const body = txBlock ? `${txBlock}\n\n${DEFAULT_OWNER_BODY}` : DEFAULT_OWNER_BODY;
  return {
    subject: resolveBaseSubject(payload),
    body,
  };
}

/** Same subject as {@link formatProjectEmail}; body explains how the RPM can reply with structured updates. */
export function formatProjectEmailForRpm(payload: ProjectEmailPayload): FormattedProjectEmail {
  const txBlock = formatRecordedTransactionBlock(payload);
  const body = txBlock ? `${txBlock}\n\n${RPM_UPDATE_GUIDE}` : RPM_UPDATE_GUIDE;
  return {
    subject: resolveBaseSubject(payload),
    body,
  };
}
