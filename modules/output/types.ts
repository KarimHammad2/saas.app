import type { ProjectContext, RPMSuggestion } from "@/modules/contracts/types";

export type ProjectEmailKind = "welcome" | "update" | "reminder";

export interface ProjectEmailPayload {
  context: ProjectContext;
  pendingSuggestions: RPMSuggestion[];
  nextSteps: string[];
  /** @deprecated Prefer emailKind */
  isWelcome: boolean;
  emailKind?: ProjectEmailKind;
}
