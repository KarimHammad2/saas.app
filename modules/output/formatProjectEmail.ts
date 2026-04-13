import type { ProjectEmailPayload } from "@/modules/output/types";

export interface FormattedProjectEmail {
  subject: string;
  body: string;
}

function resolveBaseSubject(payload: ProjectEmailPayload): string {
  const isKickoff = payload.emailKind ? payload.emailKind === "kickoff" : payload.isWelcome;
  return isKickoff ? "Your project has been initialized" : "Project Update";
}

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
