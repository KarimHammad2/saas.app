import type { ProjectEmailPayload } from "@/modules/output/types";

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

/**
 * Minimal human-facing email: full project state lives in the markdown attachment only.
 */
export function formatProjectEmail(payload: ProjectEmailPayload): FormattedProjectEmail {
  return {
    subject: resolveBaseSubject(payload),
    body: `
Here is your updated project file.

Upload it into your LLM and continue working on your project.
  `.trim(),
  };
}

/** Same subject as {@link formatProjectEmail}; body explains how the RPM can reply with structured updates. */
export function formatProjectEmailForRpm(payload: ProjectEmailPayload): FormattedProjectEmail {
  return {
    subject: resolveBaseSubject(payload),
    body: RPM_UPDATE_GUIDE,
  };
}
