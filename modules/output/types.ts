import type { ProjectContext, RPMSuggestion, UserProfileContext } from "@/modules/contracts/types";

export type ProjectEmailKind = "kickoff" | "welcome" | "update" | "reminder";

export interface ProjectEmailPayload {
  context: ProjectContext;
  /** Global user memory (not project data); injected into the attachment for the LLM. */
  userProfile: UserProfileContext;
  pendingSuggestions: RPMSuggestion[];
  nextSteps: string[];
  /** @deprecated Prefer emailKind */
  isWelcome: boolean;
  emailKind?: ProjectEmailKind;
}
