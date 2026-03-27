import type { ProjectContext, RPMSuggestion } from "@/modules/contracts/types";
import type { ProjectEmailPayload } from "@/modules/output/types";

export function buildReminderEmailPayload(context: ProjectContext, pendingSuggestions: RPMSuggestion[]): ProjectEmailPayload {
  return {
    context,
    pendingSuggestions,
    nextSteps: ["Reply to this thread with any updates on your project."],
    isWelcome: false,
    emailKind: "reminder",
  };
}
