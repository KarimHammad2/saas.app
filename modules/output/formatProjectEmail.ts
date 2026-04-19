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
Here is your updated project file as the assigned RPM.

Upload the attachment into your LLM if you use it for review.

To update this project by email, reply in this thread (or keep the project code in the subject) and use plain-text blocks the system recognizes:

• Correction: or RPM Correction: — correct facts, deadlines, or priorities (applied as RPM input).
• Goals:, Tasks:, Completed:, Risks:, Decisions:, Notes: — structured project updates, same as the primary contact.
• UserProfile Suggestion: — propose profile changes for the account owner (the owner approves or rejects those in project mail).
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
