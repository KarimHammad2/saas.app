import {
  getAllowOverviewOverride,
  getMasterUserEmail,
  getOverviewRegenerationMode,
} from "@/lib/env";
import { log } from "@/lib/log";
import type { NormalizedEmailEvent, RPMSuggestion, Tier } from "@/modules/contracts/types";
import { collectParticipantEmailsFromEvent } from "@/modules/email/participantEmails";
import { parseProjectCodeFromSubject } from "@/modules/email/parseInbound";
import { isIgnoredNoteInput } from "@/modules/email/noteInputValidation";
import { filterParticipantEmailsByEntitlements, resolvePlanEntitlements } from "@/modules/domain/entitlements";
import { applyTierFinancials } from "@/modules/domain/financial";
import { getKickoffFollowUpQuestions } from "@/modules/domain/kickoff";
import { combineRuleBasedOverview } from "@/modules/domain/overviewRegeneration";
import { extractKickoffSeed } from "@/modules/domain/kickoffSeed";
import { generateShortProjectName, normalizeProjectNameCandidate } from "@/modules/domain/projectName";
import { runKickoffFlow } from "@/modules/domain/kickoffService";
import { inferMemorySignals } from "@/modules/domain/memoryInference";
import { getNextTier } from "@/modules/domain/pricing";
import { generateRPMSuggestions, getSystemRpmSenderEmail } from "@/modules/domain/rpmSuggestions";
import { canApproveTransaction, canModifyUserProfile, canProposeUserProfile, resolveActorRole } from "@/modules/domain/rbac";
import { canSenderUpdateProject } from "@/modules/domain/projectAccess";
import { detectCompletedTasks, extractUnmatchedCompletionNotes, filterCompletedToKnownTasks } from "@/modules/domain/completionDetection";
import { applyTaskIntents } from "@/modules/domain/taskIntentClassifier";
import { detectProjectScopeChange, extractScopeTransition } from "@/modules/domain/scopeChangeDetection";
import { MemoryRepository, mergeUniqueStringsPreserveOrder, type ProjectRecord } from "@/modules/memory/repository";
import { ClarificationRequiredError, NonRetryableInboundError } from "@/modules/orchestration/errors";
import { classifyInboundIntent } from "@/modules/orchestration/classifyInboundIntent";
import type { ProjectEmailPayload } from "@/modules/output/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

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

function deriveProjectName(event: NormalizedEmailEvent): string {
  const fromBody = (event.parsed.summary || event.rawBody).trim();
  const bodyKickoffSeed = extractKickoffSeed(fromBody).seed;
  if (bodyKickoffSeed) {
    return generateShortProjectName(bodyKickoffSeed, "New Project");
  }
  if (fromBody) {
    return generateShortProjectName(fromBody, "New Project");
  }

  const withoutToken = event.subject.replace(/\[PJT-[A-F0-9]{6,10}\]/gi, "").trim();
  const cleanedSubject = withoutToken.replace(/^re:\s*/i, "").trim();
  const subjectKickoffSeed = extractKickoffSeed(cleanedSubject).seed;
  if (subjectKickoffSeed) {
    return generateShortProjectName(subjectKickoffSeed, "New Project");
  }
  if (cleanedSubject) {
    return generateShortProjectName(cleanedSubject, "New Project");
  }

  return "New Project";
}

async function resolveInboundProject(
  repo: MemoryRepository,
  userId: string,
  event: NormalizedEmailEvent,
): Promise<{ project: ProjectRecord; created: boolean }> {
  const hasThreadContext = Boolean(event.inReplyTo) || event.references.length > 0;
  const code = parseProjectCodeFromSubject(event.subject);
  let project: ProjectRecord | null = null;

  // Highest priority: explicit reply thread linkage.
  if (event.inReplyTo) {
    project = await repo.findProjectByThreadMessageIdForUser(event.inReplyTo, userId);
    if (!project) {
      project = await repo.findProjectByThreadMessageId(event.inReplyTo);
    }
  }

  if (!project) {
    for (const ref of event.references) {
      project = await repo.findProjectByThreadMessageIdForUser(ref, userId);
      if (project) {
        break;
      }
      project = await repo.findProjectByThreadMessageId(ref);
      if (project) {
        break;
      }
    }
  }

  if (project) {
    return { project, created: false };
  }

  // Next priority: explicit subject project code.
  if (code) {
    project = await repo.findProjectByCodeAndUser(code, userId);
    if (!project) {
      project = await repo.findProjectByCode(code);
    }
    if (project) {
      return { project, created: false };
    }
    throw new ClarificationRequiredError("Inbound message references unknown project code.", {
      senderEmail: event.from,
      senderSubject: event.subject,
      intentReason: "project code did not map to a known project",
    });
  }

  // If this was a reply-like message but we couldn't map thread context, avoid accidental project creation.
  if (hasThreadContext) {
    throw new ClarificationRequiredError("Inbound message has unresolved thread context.", {
      senderEmail: event.from,
      senderSubject: event.subject,
      intentReason: "thread reference did not map to a known project",
    });
  }

  const intent = classifyInboundIntent(event.subject, event.rawBody);
  if (intent.isGreetingOnly) {
    throw new ClarificationRequiredError("Inbound greeting requires clarification for non-threaded messages.", {
      senderEmail: event.from,
      senderSubject: event.subject,
      intentReason: intent.reason,
    });
  }

  if (!intent.isNewProjectIntent) {
    throw new ClarificationRequiredError("Inbound message lacks sufficient project intent.", {
      senderEmail: event.from,
      senderSubject: event.subject,
      intentReason: intent.reason,
    });
  }

  return repo.createProjectForUser(userId, deriveProjectName(event));
}

function defaultNextSteps(): string[] {
  return [
    "Reply with labeled sections (Goals:, Tasks:, Notes:) for reliable parsing.",
    'Use "UserProfile:" for profile context updates.',
    'Use "UserProfile Suggestion:" for RPM-proposed profile updates.',
    "Use transaction blocks and explicit approvals to record financial events.",
    'Use "approve suggestion <id>" or "reject suggestion <id>" to resolve pending proposals.',
  ];
}

export async function processInboundEmail(event: NormalizedEmailEvent): Promise<InboundProcessingResult> {
  const repo = new MemoryRepository();
  const inserted = await repo.registerInboundEvent(event.provider, event.providerEventId, event as unknown as Record<string, unknown>);

  const { user, created: userCreated } = await repo.getOrCreateUserByEmail(event.from);
  const { project } = await resolveInboundProject(repo, user.id, event);

  const ownerUserId = project.user_id;

  if (!inserted) {
    log.info("duplicate inbound event ignored", { provider: event.provider, providerEventId: event.providerEventId });
    const projectState = await repo.getProjectState(project.id);
    const pendingSuggestions = await repo.getPendingSuggestions(ownerUserId, project.id);
    const userProfile = await repo.getUserProfile(ownerUserId);
    return {
      recipients: buildRecipientList(projectState),
      payload: {
        context: projectState,
        userProfile,
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

  await repo.ensureUserProfileRow(ownerUserId);
  await repo.ensureUserProfileRow(user.id);

  const accessState = await repo.getProjectState(project.id);
  const activeRpmEmail = await repo.getActiveRpm(project.id);
  if (
    !canSenderUpdateProject({
      senderEmail: event.from,
      ownerEmail: accessState.ownerEmail,
      participantEmails: accessState.participants,
      activeRpmEmail,
    })
  ) {
    throw new NonRetryableInboundError("Sender is not allowed to update this project.", {
      code: "PROJECT_ACCESS_DENIED",
      status: 403,
    });
  }

  const requestedProjectName = normalizeProjectNameCandidate(event.parsed.projectName || "");
  const currentProjectName = normalizeProjectNameCandidate(project.name || "");
  if (
    requestedProjectName &&
    requestedProjectName.toLowerCase() !== (currentProjectName || "").toLowerCase()
  ) {
    await repo.updateProjectName(project.id, requestedProjectName);
    await repo.appendRecentUpdate(project.id, `Project renamed to: ${requestedProjectName}`);
  }

  const entitlements = resolvePlanEntitlements(accessState.tier);
  const participantCandidates = collectParticipantEmailsFromEvent(event);
  const filteredParticipantCandidates = filterParticipantEmailsByEntitlements({
    candidateEmails: participantCandidates,
    existingParticipantEmails: accessState.participants,
    ownerEmail: accessState.ownerEmail,
    activeRpmEmail,
    entitlements,
  });
  await repo.mergeProjectParticipants(project.id, filteredParticipantCandidates);

  await repo.storeRawProjectUpdate(project.id, event.rawBody, event as unknown as Record<string, unknown>);

  if (userCreated && event.fromDisplayName) {
    await repo.updateUserDisplayNameIfEmpty(user.id, event.fromDisplayName);
  }

  const priorSnapshot = await repo.getProjectState(project.id);

  const shouldRunKickoff = !project.kickoff_completed_at;
  if (shouldRunKickoff) {
    await runKickoffFlow(repo, event, user.id, project.id);
  }

  const ownerEmailForRole = accessState.ownerEmail ?? user.email;
  const role = resolveActorRole({
    senderEmail: event.from,
    primaryUserEmail: ownerEmailForRole,
    activeRpmEmail,
  });

  if (event.parsed.summary && getAllowOverviewOverride()) {
    await repo.updateSummaryDisplay(project.id, event.parsed.summary);
  }
  if (event.parsed.projectStatus) {
    await repo.updateProjectStatus(project.id, event.parsed.projectStatus);
    const projectStatusLabel = `${event.parsed.projectStatus[0]?.toUpperCase() ?? ""}${event.parsed.projectStatus.slice(1)}`;
    await repo.appendRecentUpdate(project.id, `Project status updated: ${projectStatusLabel}`);
  }
  if (event.parsed.currentStatus) {
    await repo.updateCurrentStatus(project.id, event.parsed.currentStatus);
    await repo.appendRecentUpdate(project.id, `Status updated: ${event.parsed.currentStatus}`);
  }
  await repo.updateGoals(project.id, event.parsed.goals);
  if (event.parsed.goals.length > 0) {
    await repo.appendRecentUpdate(project.id, `Goals updated: ${event.parsed.goals.join("; ")}`);
  }
  await repo.appendActionItems(project.id, event.parsed.actionItems);
  if (event.parsed.actionItems.length > 0) {
    await repo.appendRecentUpdate(project.id, `Task(s) added: ${event.parsed.actionItems.join("; ")}`);
  }
  const stateAfterTasks = await repo.getProjectState(project.id);
  const detectedCompleted = detectCompletedTasks(event.rawBody, stateAfterTasks.actionItems);
  const fromSection = filterCompletedToKnownTasks(event.parsed.completedTasks, stateAfterTasks.actionItems);
  const allCompleted = mergeUniqueStringsPreserveOrder(fromSection, detectedCompleted);
  await repo.markTasksCompleted(project.id, allCompleted);

  if (allCompleted.length > 0) {
    await repo.appendRecentUpdate(project.id, `Task(s) completed: ${allCompleted.join("; ")}`);
  }

  const stateAfterCompletion = await repo.getProjectState(project.id);
  const unmatchedCompletionNotes = extractUnmatchedCompletionNotes(event.rawBody, allCompleted);
  const taskIntentEvents = applyTaskIntents(
    event.rawBody,
    stateAfterCompletion.actionItems,
    stateAfterCompletion.completedTasks,
  );
  const fallbackScopeTransition = detectProjectScopeChange(event.rawBody) ? extractScopeTransition(event.rawBody) : null;
  const scopeEvent = taskIntentEvents.find((ev) => ev.intent === "SCOPE_CHANGE");
  const scopeTransition = {
    fromScope: scopeEvent?.fromScope || fallbackScopeTransition?.fromScope,
    toScope: scopeEvent?.toScope || fallbackScopeTransition?.toScope,
  };
  const unknownNotesFromTaskIntents: string[] = [];
  for (const ev of taskIntentEvents) {
    if (ev.intent === "UPDATE_TASK" && ev.matchedTask && ev.updatedText) {
      await repo.replaceActionItem(project.id, ev.matchedTask, ev.updatedText);
    } else if (ev.intent === "CREATE_TASK" && !ev.matchedTask && ev.taskHint.trim()) {
      await repo.appendActionItems(project.id, [ev.taskHint.trim()]);
    } else if (ev.intent === "SCOPE_CHANGE") {
      continue;
    } else if (ev.intent === "UNKNOWN" && ev.rawSentence.trim()) {
      unknownNotesFromTaskIntents.push(ev.rawSentence.trim());
    }
  }

  const scopeChanged = Boolean(scopeEvent) || detectProjectScopeChange(event.rawBody);
  if (scopeChanged) {
    const fromBrief = scopeTransition.fromScope || compactOverviewForDocument(priorSnapshot.summary).slice(0, 120) || "(previous)";
    const toBrief =
      scopeTransition.toScope ||
      event.parsed.summary?.trim() ||
      compactOverviewForDocument(event.rawBody).slice(0, 200) ||
      "(new scope)";
    await repo.updateSummaryDisplay(project.id, toBrief);
    await repo.updateNotes(project.id, [`Scope changed from ${fromBrief} to ${toBrief}`], event.timestamp);
    await repo.appendRecentUpdate(project.id, "Scope changed");

    if (!requestedProjectName) {
      const placeholderOverview = "(new scope)";
      const nameSeed =
        scopeTransition.toScope?.trim() ||
        (toBrief.trim() && toBrief.trim().toLowerCase() !== placeholderOverview ? toBrief.trim() : "");
      if (nameSeed) {
        const currentNameNorm = normalizeProjectNameCandidate(project.name || "");
        const fallbackLabel = currentNameNorm || "Project";
        const derived = normalizeProjectNameCandidate(generateShortProjectName(nameSeed, fallbackLabel));
        if (derived && derived.toLowerCase() !== (currentNameNorm || "").toLowerCase()) {
          await repo.updateProjectName(project.id, derived);
          await repo.appendRecentUpdate(project.id, `Project renamed to: ${derived}`);
        }
      }
    }
  }

  await repo.updateDecisions(project.id, event.parsed.decisions);
  if (event.parsed.decisions.length > 0) {
    await repo.appendRecentUpdate(project.id, `Decision(s) added: ${event.parsed.decisions.join("; ")}`);
  }
  await repo.updateRisks(project.id, event.parsed.risks);
  if (event.parsed.risks.length > 0) {
    await repo.appendRecentUpdate(project.id, `Risk(s) added: ${event.parsed.risks.join("; ")}`);
  }
  await repo.updateRecommendations(project.id, event.parsed.recommendations);
  const mergedNotes = [...event.parsed.notes, ...unmatchedCompletionNotes, ...unknownNotesFromTaskIntents];
  await repo.updateNotes(project.id, mergedNotes, event.timestamp);
  const meaningfulMergedNotes = mergedNotes.map((n) => n.trim()).filter((n) => n.length > 0 && !isIgnoredNoteInput(n));
  if (meaningfulMergedNotes.length > 0) {
    await repo.appendRecentUpdate(project.id, `Notes updated (${meaningfulMergedNotes.length} item${meaningfulMergedNotes.length > 1 ? "s" : ""}).`);
  }
  const inferredMemory = inferMemorySignals({
    summary: event.parsed.summary ?? event.rawBody,
    rawBody: event.rawBody,
    goals: event.parsed.goals,
    notes: event.parsed.notes,
  });
  await repo.mergeStructuredUserProfileContext(user.id, inferredMemory.sowSignals);
  if (Object.keys(inferredMemory.constraints).length > 0) {
    await repo.patchUserProfileContextJson(user.id, { constraints: inferredMemory.constraints });
  }

  if (event.parsed.userProfileContext && canModifyUserProfile(role)) {
    await repo.storeUserProfileContext(user.id, event.parsed.userProfileContext);
  }

  if (event.parsed.rpmSuggestion && canProposeUserProfile(role)) {
    await repo.storeRPMSuggestion(ownerUserId, project.id, event.from, event.parsed.rpmSuggestion.content);
  }

  for (const approval of event.parsed.approvals) {
    if (canModifyUserProfile(role)) {
      if (approval.decision === "approve") {
        await repo.approveSuggestion(ownerUserId, approval.suggestionId, event.from);
      } else {
        await repo.rejectSuggestion(ownerUserId, approval.suggestionId, event.from);
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
    const normalizedFinancials = applyTierFinancials(event.parsed.transactionEvent, effectiveTier);
    if (!canApproveTransaction(role)) {
      const pending = await repo.storeProtectedTransactionSuggestion(ownerUserId, project.id, event.from, normalizedFinancials);
      await repo.appendRecentUpdate(
        project.id,
        `Protected transaction proposed [${pending.id}] by ${event.from}. Awaiting explicit approval.`,
      );
    } else {
      await repo.storeTransactionEvent(project.id, event.from, normalizedFinancials);
    }
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
  const userProfileForRpm = await repo.getUserProfile(ownerUserId);
  await repo.deletePendingSystemSuggestionsForProject(project.id);
  for (const line of generateRPMSuggestions(projectStateForRpm, userProfileForRpm)) {
    await repo.storeRPMSuggestion(ownerUserId, project.id, getSystemRpmSenderEmail(), line, "system");
  }

  await repo.snapshotProjectContext(project.id);
  await repo.incrementProjectUsageCount(project.id);

  const projectState = await repo.getProjectState(project.id);
  const pendingSuggestions: RPMSuggestion[] = await repo.getPendingSuggestions(ownerUserId, project.id);
  const recipients = buildRecipientList(projectState);

  const isWelcome = shouldRunKickoff;
  const nextSteps = isWelcome
    ? [...getKickoffFollowUpQuestions(projectState.projectDomain ?? "general"), ...defaultNextSteps()]
    : defaultNextSteps();

  return {
    recipients,
    payload: {
      context: projectState,
      userProfile: userProfileForRpm,
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

function buildRecipientList(projectState: { ownerEmail?: string; participants: string[] }): string[] {
  const raw = [projectState.ownerEmail, ...projectState.participants].filter(
    (entry): entry is string => typeof entry === "string" && entry.includes("@"),
  );
  return Array.from(new Set(raw.map((e) => e.trim().toLowerCase())));
}
