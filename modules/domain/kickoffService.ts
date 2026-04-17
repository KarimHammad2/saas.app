import { getMasterUserEmail } from "@/lib/env";
import type { NormalizedEmailEvent, UserProfileStructuredContext } from "@/modules/contracts/types";
import type { JsonRecord } from "@/modules/domain/userProfileMerge";
import { buildKickoffSummary } from "@/modules/domain/kickoff";
import { inferMemorySignals } from "@/modules/domain/memoryInference";

interface KickoffRepository {
  storeSummary(projectId: string, summary: string): Promise<void>;
  updateGoals(projectId: string, goals: string[]): Promise<void>;
  appendActionItems(projectId: string, items: string[]): Promise<void>;
  updateNotes(projectId: string, notes: string[], receivedAtIso?: string): Promise<void>;
  storeUserProfileContext(userId: string, contextText: string): Promise<void>;
  mergeStructuredUserProfileContext(
    userId: string,
    patch: Partial<UserProfileStructuredContext>,
  ): Promise<void>;
  patchUserProfileContextJson(userId: string, patch: JsonRecord): Promise<void>;
  getActiveRpm(projectId: string): Promise<string | null>;
  assignRpm(projectId: string, rpmEmail: string, assignedByEmail: string): Promise<void>;
  setKickoffCompleted(projectId: string): Promise<void>;
}

export async function runKickoffFlow(
  repo: KickoffRepository,
  event: NormalizedEmailEvent,
  userId: string,
  projectId: string,
): Promise<void> {
  const kickoff = buildKickoffSummary(event);
  await repo.storeSummary(projectId, kickoff.summary);
  await repo.updateGoals(projectId, kickoff.goals);
  await repo.appendActionItems(projectId, kickoff.actionItems);
  await repo.updateNotes(projectId, kickoff.initialNotes, event.timestamp);

  if (kickoff.constraints.length > 0) {
    const content = `Initial constraints:\n${kickoff.constraints.map((item) => `- ${item}`).join("\n")}`;
    await repo.storeUserProfileContext(userId, content);
  }
  const inferred = inferMemorySignals({
    summary: kickoff.summary,
    rawBody: event.rawBody,
    goals: kickoff.goals,
    notes: kickoff.initialNotes,
  });
  await repo.mergeStructuredUserProfileContext(userId, inferred.sowSignals);
  if (Object.keys(inferred.constraints).length > 0) {
    await repo.patchUserProfileContextJson(userId, { constraints: inferred.constraints });
  }

  const activeRpm = await repo.getActiveRpm(projectId);
  if (!activeRpm) {
    await repo.assignRpm(projectId, getMasterUserEmail(), "system@saas2.app");
  }

  await repo.setKickoffCompleted(projectId);
}
