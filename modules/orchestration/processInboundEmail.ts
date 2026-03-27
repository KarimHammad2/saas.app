import { getMasterUserEmail } from "@/lib/env";
import { log } from "@/lib/log";
import type { NormalizedEmailEvent, RPMSuggestion, Tier } from "@/modules/contracts/types";
import { applyTierFinancials } from "@/modules/domain/financial";
import { runKickoffFlow } from "@/modules/domain/kickoffService";
import { getNextTier } from "@/modules/domain/pricing";
import { canApproveTransaction, canModifyUserProfile, canProposeUserProfile, resolveActorRole } from "@/modules/domain/rbac";
import { MemoryRepository } from "@/modules/memory/repository";
import type { ProjectEmailPayload } from "@/modules/output/types";

export interface InboundProcessingResult {
  recipients: string[];
  payload: ProjectEmailPayload;
  context: {
    userId: string;
    projectId: string;
    eventId: string;
    duplicate: boolean;
  };
}

function inferProjectName(event: NormalizedEmailEvent): string {
  const match = event.subject.match(/\[project:\s*([^\]]+)\]/i);
  if (!match) {
    return "Primary Project";
  }
  return match[1].trim().slice(0, 120) || "Primary Project";
}

function defaultNextSteps(): string[] {
  return [
    "Reply with updates using labeled sections for best parsing quality.",
    'Use "UserProfile:" for profile context updates.',
    'Use "UserProfile Suggestion:" for RPM-proposed profile updates.',
    "Use transaction blocks and explicit approvals to record financial events.",
  ];
}

export async function processInboundEmail(event: NormalizedEmailEvent): Promise<InboundProcessingResult> {
  const repo = new MemoryRepository();
  const inserted = await repo.registerInboundEvent(event.provider, event.providerEventId, event as unknown as Record<string, unknown>);

  const { user, created: userCreated } = await repo.getOrCreateUserByEmail(event.from);
  const projectName = inferProjectName(event);
  const { project, created: projectCreated } = await repo.getOrCreateProject(user.id, projectName);

  if (!inserted) {
    log.info("duplicate inbound event ignored", { provider: event.provider, providerEventId: event.providerEventId });
    const projectState = await repo.getProjectState(project.id);
    const pendingSuggestions = await repo.getPendingSuggestions(user.id);
    return {
      recipients: [user.email],
      payload: {
        context: projectState,
        pendingSuggestions,
        nextSteps: defaultNextSteps(),
        isWelcome: false,
      },
      context: {
        userId: user.id,
        projectId: project.id,
        eventId: event.eventId,
        duplicate: true,
      },
    };
  }

  await repo.storeRawProjectUpdate(project.id, event.rawBody, event as unknown as Record<string, unknown>);

  if (userCreated || projectCreated) {
    await runKickoffFlow(repo, event, user.id, project.id);
  }

  const activeRpmEmail = await repo.getActiveRpm(project.id);
  const role = resolveActorRole({
    senderEmail: event.from,
    primaryUserEmail: user.email,
    activeRpmEmail,
  });

  if (event.parsed.summary) {
    await repo.storeSummary(project.id, event.parsed.summary);
  }
  if (event.parsed.currentStatus) {
    await repo.updateCurrentStatus(project.id, event.parsed.currentStatus);
  }
  await repo.updateGoals(project.id, event.parsed.goals);
  await repo.appendActionItems(project.id, event.parsed.actionItems);
  await repo.updateDecisions(project.id, event.parsed.decisions);
  await repo.updateRisks(project.id, event.parsed.risks);
  await repo.updateRecommendations(project.id, event.parsed.recommendations);
  await repo.updateNotes(project.id, event.parsed.notes, event.timestamp);

  if (event.parsed.userProfileContext && canModifyUserProfile(role)) {
    await repo.storeUserProfileContext(user.id, event.parsed.userProfileContext);
  }

  if (event.parsed.rpmSuggestion && canProposeUserProfile(role)) {
    await repo.storeRPMSuggestion(user.id, project.id, event.from, event.parsed.rpmSuggestion.content);
  }

  for (const approval of event.parsed.approvals) {
    if (canModifyUserProfile(role)) {
      if (approval.decision === "approve") {
        await repo.approveSuggestion(user.id, approval.suggestionId, event.from);
      } else {
        await repo.rejectSuggestion(user.id, approval.suggestionId, event.from);
      }
    }
  }

  const emailCount = await repo.addAdditionalEmails(user.id, event.parsed.additionalEmails);
  const nextTier = getNextTier({
    currentTier: user.tier,
    hasTransactionEvent: !!event.parsed.transactionEvent,
    totalAccountEmails: emailCount,
  });

  if (nextTier !== user.tier) {
    await repo.setUserTier(user.id, nextTier);
    if (nextTier === "solopreneur" && !activeRpmEmail) {
      await repo.assignRpm(project.id, getMasterUserEmail(), event.from);
    }
  }

  let effectiveTier: Tier = nextTier;
  if (!effectiveTier) {
    effectiveTier = user.tier;
  }

  if (event.parsed.transactionEvent) {
    if (!canApproveTransaction(role)) {
      throw new Error("Transactions require user approval.");
    }
    const normalizedFinancials = applyTierFinancials(event.parsed.transactionEvent, effectiveTier);
    await repo.storeTransactionEvent(project.id, event.from, normalizedFinancials);
  }

  await repo.snapshotProjectContext(project.id);
  const projectState = await repo.getProjectState(project.id);
  const pendingSuggestions: RPMSuggestion[] = await repo.getPendingSuggestions(user.id);
  const userRpm = await repo.getActiveRpm(project.id);
  const recipients = [user.email, userRpm].filter((entry): entry is string => Boolean(entry));

  return {
    recipients,
    payload: {
      context: projectState,
      pendingSuggestions,
      nextSteps: defaultNextSteps(),
      isWelcome: userCreated || projectCreated,
    },
    context: {
      userId: user.id,
      projectId: project.id,
      eventId: event.eventId,
      duplicate: false,
    },
  };
}
