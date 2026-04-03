import type { ProjectEmailPayload } from "@/modules/output/types";

export interface FormattedProjectEmail {
  subject: string;
  body: string;
}

/**
 * Minimal human-facing email: full project state lives in the markdown attachment only.
 */
export function formatProjectEmail(_payload: ProjectEmailPayload): FormattedProjectEmail {
  void _payload;
  return {
    subject: "Project Update",
    body: `
Here is your updated project file.

Upload it into your LLM and continue working on your project.
  `.trim(),
  };
}
