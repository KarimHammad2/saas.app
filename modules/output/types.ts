import type { ProjectContext, RPMSuggestion } from "@/modules/contracts/types";

export interface ProjectEmailPayload {
  context: ProjectContext;
  pendingSuggestions: RPMSuggestion[];
  nextSteps: string[];
  isWelcome: boolean;
}
