import {
  getAllowOverviewOverride,
  getMasterUserEmail,
  getOverviewRegenerationMode,
} from "@/lib/env";
import { log } from "@/lib/log";
import type { NormalizedEmailEvent, RPMSuggestion, Tier } from "@/modules/contracts/types";
import { parseProjectCodeFromSubject } from "@/modules/email/parseInbound";
import { applyTierFinancials } from "@/modules/domain/financial";
import { getKickoffFollowUpQuestions } from "@/modules/domain/kickoff";
import { combineRuleBasedOverview } from "@/modules/domain/overviewRegeneration";
import { runKickoffFlow } from "@/modules/domain/kickoffService";
import { inferMemorySignals } from "@/modules/domain/memoryInference";
import { getNextTier } from "@/modules/domain/pricing";
import { generateRPMSuggestions, getSystemRpmSenderEmail } from "@/modules/domain/rpmSuggestions";
import { canApproveTransaction, canModifyUserProfile, canProposeUserProfile, resolveActorRole } from "@/modules/domain/rbac";
import { detectCompletedTasks, filterCompletedToKnownTasks } from "@/modules/domain/completionDetection";
import { MemoryRepository, mergeUniqueStringsPreserveOrder, type ProjectRecord } from "@/modules/memory/repository";
import { ClarificationRequiredError, NonRetryableInboundError } from "@/modules/orchestration/errors";
import { classifyInboundIntent } from "@/modules/orchestration/classifyInboundIntent";
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

function deriveProjectName(subject: string): string {
  const withoutToken = subject.replace(/\[PJT-[A-F0-9]{6,10}\]/gi, "").trim();
  const cleaned = withoutToken.replace(/^re:\s*/i, "").trim();
  if (cleaned.length > 0) {
    return cleaned.slice(0, 200);
  }
  return "New Project";
}

async function resolveInboundProject(
  repo: MemoryRepository,
  userId: string,
  event: NormalizedEmailEvent,
): Promise<{ project: ProjectRecord; created: boolean }> {
  const code = parseProjectCodeFromSubject(event.subject);
  let project: ProjectRecord | null = null;

  if (code) {
    project = await repo.findProjectByCodeAndUser(code, userId);
  }

  if (!project && event.inReplyTo) {
    project = await repo.findProjectByThreadMessageIdForUser(event.inReplyTo, userId);
  }

  if (!project) {
    for (const ref of event.references) {
      project = await repo.findProjectByThreadMessageIdForUser(ref, userId);
      if (project) {
        break;
      }
    }
  }

  if (project) {
    return { project, created: false };
  }

  // No existing project found — this would create a new one.
  // Classify intent first: only create a project when the message clearly describes one.
  const intent = classifyInboundIntent(event.subject, event.rawBody);
  if (!intent.isNewProjectIntent) {
    throw new ClarificationRequiredError("Inbound message lacks sufficient project intent.", {
      senderEmail: event.from,
      senderSubject: event.subject,
      intentReason: intent.reason,
    });
  }

  return repo.createProjectForUser(userId, deriveProjectName(event.subject));
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
  const { project, created: projectCreated } = await resolveInboundProject(repo, user.id, event);

  if (!inserted) {
    log.info("duplicate inbound event ignored", { provider: event.provider, providerEventId: event.providerEventId });
    const projectState = await repo.getProjectState(project.id);
    const pendingSuggestions = await repo.getPendingSuggestions(user.id, project.id);
    return {
      recipients: [user.email],
      payload: {
        context: projectState,
        pendingSuggestions,
        nextSteps: defaultNextSteps(),
        isWelcome: false,
        emailKind: "update",
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

  if (userCreated && event.fromDisplayName) {
    await repo.updateUserDisplayNameIfEmpty(user.id, event.fromDisplayName);
  }

  const shouldRunKickoff = !project.kickoff_completed_at;
  if (shouldRunKickoff) {
    await runKickoffFlow(repo, event, user.id, project.id);
  }

  const activeRpmEmail = await repo.getActiveRpm(project.id);
  const role = resolveActorRole({
    senderEmail: event.from,
    primaryUserEmail: user.email,
    activeRpmEmail,
  });

  if (event.parsed.summary && getAllowOverviewOverride()) {
    await repo.updateSummaryDisplay(project.id, event.parsed.summary);
  }
  if (event.parsed.currentStatus) {
    await repo.updateCurrentStatus(project.id, event.parsed.currentStatus);
  }
  await repo.updateGoals(project.id, event.parsed.goals);
  await repo.appendActionItems(project.id, event.parsed.actionItems);
  const stateAfterTasks = await repo.getProjectState(project.id);
  const detectedCompleted = detectCompletedTasks(event.rawBody, stateAfterTasks.actionItems);
  const fromSection = filterCompletedToKnownTasks(event.parsed.completedTasks, stateAfterTasks.actionItems);
  const allCompleted = mergeUniqueStringsPreserveOrder(fromSection, detectedCompleted);
  await repo.markTasksCompleted(project.id, allCompleted);
  await repo.updateDecisions(project.id, event.parsed.decisions);
  await repo.updateRisks(project.id, event.parsed.risks);
  await repo.updateRecommendations(project.id, event.parsed.recommendations);
  await repo.updateNotes(project.id, event.parsed.notes, event.timestamp);
  await repo.mergeStructuredUserProfileContext(
    user.id,
    inferMemorySignals({
      summary: event.parsed.summary ?? event.rawBody,
      rawBody: event.rawBody,
      goals: event.parsed.goals,
      notes: event.parsed.notes,
    }),
  );

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
      throw new NonRetryableInboundError("Transactions require user approval.", {
        code: "TRANSACTION_APPROVAL_REQUIRED",
        status: 403,
      });
    }
    const normalizedFinancials = applyTierFinancials(event.parsed.transactionEvent, effectiveTier);
    await repo.storeTransactionEvent(project.id, event.from, normalizedFinancials);
  }

  if (getOverviewRegenerationMode() === "rules") {
    const s = await repo.getProjectState(project.id);
    const nextOverview = combineRuleBasedOverview({
      initialOverview: s.initialSummary || s.summary,
      goals: s.goals,
      notes: s.notes,
    });
    await repo.updateSummaryDisplay(project.id, nextOverview);
  }

  const projectStateForRpm = await repo.getProjectState(project.id);
  const userProfileForRpm = await repo.getUserProfile(user.id);
  await repo.deletePendingSystemSuggestionsForProject(project.id);
  for (const line of generateRPMSuggestions(projectStateForRpm, userProfileForRpm)) {
    await repo.storeRPMSuggestion(user.id, project.id, getSystemRpmSenderEmail(), line, "system");
  }

  await repo.snapshotProjectContext(project.id);
  await repo.incrementProjectUsageCount(project.id);

  const projectState = await repo.getProjectState(project.id);
  const pendingSuggestions: RPMSuggestion[] = await repo.getPendingSuggestions(user.id, project.id);
  const userRpm = await repo.getActiveRpm(project.id);
  const recipients = [user.email, userRpm].filter((entry): entry is string => Boolean(entry));

  const isWelcome = shouldRunKickoff;
  const nextSteps = isWelcome ? [...getKickoffFollowUpQuestions(), ...defaultNextSteps()] : defaultNextSteps();

  return {
    recipients,
    payload: {
      context: projectState,
      pendingSuggestions,
      nextSteps,
      isWelcome,
      emailKind: isWelcome ? "kickoff" : "update",
    },
    context: {
      userId: user.id,
      projectId: project.id,
      eventId: event.eventId,
      duplicate: false,
    },
  };
}
