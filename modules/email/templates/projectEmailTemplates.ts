import type { ProjectContext, RPMSuggestion, UserProfileContext } from "@/modules/contracts/types";
import type { ProjectEmailPayload } from "@/modules/output/types";

export function buildReminderEmailPayload(
  context: ProjectContext,
  pendingSuggestions: RPMSuggestion[],
  userProfile: UserProfileContext,
): ProjectEmailPayload {
  return {
    context,
    userProfile,
    pendingSuggestions,
    nextSteps: ["Reply to this thread with any updates on your project."],
    isWelcome: false,
    emailKind: "reminder",
  };
}
