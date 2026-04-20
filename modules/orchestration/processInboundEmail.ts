import {
  getAllowOverviewOverride,
  getMasterUserEmail,
  getOverviewRegenerationMode,
} from "@/lib/env";
import { log } from "@/lib/log";
import type { NormalizedEmailEvent, RPMSuggestion, Tier } from "@/modules/contracts/types";
import { collectParticipantEmailsFromEvent } from "@/modules/email/participantEmails";
import {
  hasAnyProjectMemoryPresence,
  parseNormalizedContent,
  parseProjectCodeFromSubject,
  prepareInboundPlainText,
} from "@/modules/email/parseInbound";
import { isIgnoredNoteInput } from "@/modules/email/noteInputValidation";
import { filterParticipantEmailsByEntitlements, resolvePlanEntitlements } from "@/modules/domain/entitlements";
import { buildProjectEmailRecipientList } from "@/modules/domain/projectEmailRecipients";
import { applyTierFinancials } from "@/modules/domain/financial";
import { getKickoffFollowUpQuestions } from "@/modules/domain/kickoff";
import { normalizeListItemKey } from "@/modules/domain/mergeUniqueStrings";
import { stableVariantIndex, type PlaybookVariant } from "@/modules/domain/playbookVariant";
import { combineRuleBasedOverview } from "@/modules/domain/overviewRegeneration";
import { extractKickoffSeed } from "@/modules/domain/kickoffSeed";
import { generateShortProjectName, normalizeProjectNameCandidate } from "@/modules/domain/projectName";
import { runKickoffFlow } from "@/modules/domain/kickoffService";
import { inferMemorySignals } from "@/modules/domain/memoryInference";
import { getNextTier } from "@/modules/domain/pricing";
import { parseCcMembershipDecision } from "@/modules/domain/ccMembershipDecision";
import { generateRPMSuggestions, getSystemRpmSenderEmail } from "@/modules/domain/rpmSuggestions";
import {
  canApplyInboundUserProfileEdit,
  canApproveTransaction,
  canAssignProjectRpmViaInbound,
  canProposeUserProfile,
  resolveActorRole,
} from "@/modules/domain/rbac";
import { isUserProfileSuggestionOnlyInbound } from "@/modules/domain/userProfileSuggestionOnly";
import { canSenderUpdateProject } from "@/modules/domain/projectAccess";
import { detectCompletedTasks, extractUnmatchedCompletionNotes, filterCompletedToKnownTasks } from "@/modules/domain/completionDetection";
import { applyTaskIntents } from "@/modules/domain/taskIntentClassifier";
import { detectProjectScopeChange, extractScopeTransition } from "@/modules/domain/scopeChangeDetection";
import {
  AdditionalEmailConflictError,
  MemoryRepository,
  mergeUniqueStringsPreserveOrder,
  type CcMembershipConfirmationRecord,
  type ProjectRecord,
} from "@/modules/memory/repository";
import { CcMembershipConfirmationRequiredError, ClarificationRequiredError, NonRetryableInboundError } from "@/modules/orchestration/errors";
import { classifyInboundIntent } from "@/modules/orchestration/classifyInboundIntent";
import type { ProjectEmailPayload } from "@/modules/output/types";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

export interface InboundProcessingResult {
  recipients: string[];
  payload: ProjectEmailPayload;
  /** When `rpm_profile_proposal`, send lightweight proposal mail to owner instead of full project attachment. */
  outboundMode: "full" | "rpm_profile_proposal";
  /** Set when outboundMode is `rpm_profile_proposal` (inbound-stored suggestion row). */
  rpmProfileProposal: RPMSuggestion | null;
  context: {
    userId: string;
    projectId: string;
    eventId: string;
    duplicate: boolean;
  };
}

/**
 * When kickoff was deferred for CC confirmation, the inbound "yes/no" message must not drive
 * project name, kickoff, or parsed sections — use stored original subject/body from the pending row.
 */
function buildContentEventFromPendingKickoff(
  inbound: NormalizedEmailEvent,
  pending: CcMembershipConfirmationRecord,
): NormalizedEmailEvent {
  const rawSource = pending.source_raw_body?.trim() ? pending.source_raw_body : inbound.rawBody;
  const rawBody = prepareInboundPlainText(rawSource);
  const subject = pending.source_subject?.trim() ? pending.source_subject : inbound.subject;
  const parsed = parseNormalizedContent(rawBody);
  return {
    ...inbound,
    subject,
    rawBody,
    parsed,
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

/**
 * Task-intent parsing splits the body into sentences; UNKNOWN fragments can repeat text
 * already stored as a single full-body note. Skip those so one inbound message stays one note.
 */
function filterUnknownNotesSubsumedByPriorNotes(unknownFragments: string[], priorNotes: string[]): string[] {
  const normalizedPrior = priorNotes.map((n) => normalizeListItemKey(n)).filter(Boolean);
  return unknownFragments.filter((fragment) => {
    const nf = normalizeListItemKey(fragment);
    if (!nf) {
      return false;
    }
    return !normalizedPrior.some((np) => np.includes(nf));
  });
}

async function resolveInboundProject(
  repo: MemoryRepository,
  userId: string,
  event: NormalizedEmailEvent,
  options?: { currentTier: Tier; ownerEmail: string; sourceInboundEventId: string },
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

  const sender = event.from.trim().toLowerCase();
  const kickoffCcCandidates = collectParticipantEmailsFromEvent(event).filter((email) => email !== sender);
  if ((options?.currentTier === "freemium" || options?.currentTier === "solopreneur") && kickoffCcCandidates.length > 0) {
    const pending = await repo.createOrReusePendingCcMembershipConfirmation({
      ownerUserId: userId,
      ownerEmail: options.ownerEmail,
      candidateEmails: kickoffCcCandidates,
      sourceInboundEventId: options.sourceInboundEventId,
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    throw new CcMembershipConfirmationRequiredError("CC membership confirmation required before kickoff creation.", {
      ownerEmail: options.ownerEmail,
      senderSubject: event.subject,
      candidateEmails: kickoffCcCandidates,
      confirmationId: pending.id,
    });
  }

  return repo.createProjectForUser(userId, deriveProjectName(event), {
    createdByEmail: event.from,
    createdByUserId: userId,
  });
}

function shouldRequireRpmStructuredProjectClarification(
  parsed: NormalizedEmailEvent["parsed"],
  rawBody: string,
): boolean {
  if (isIgnoredNoteInput(rawBody)) {
    return false;
  }
  if (hasAnyProjectMemoryPresence(parsed.projectSectionPresence)) {
    return false;
  }
  if (
    parsed.projectStatus ||
    parsed.userProfileContext ||
    parsed.rpmSuggestion ||
    parsed.correction ||
    parsed.assignRpmEmail ||
    parsed.transactionEvent ||
    parsed.approvals.length > 0 ||
    parsed.additionalEmails.length > 0 ||
    parsed.projectName
  ) {
    return false;
  }
  return rawBody.trim().length > 0;
}

function defaultNextSteps(): string[] {
  return [
    "Reply with labeled sections (Goals:, Tasks:, Notes:) for reliable parsing.",
    'Use "UserProfile:" for profile context updates.',
    'Use "UserProfile Suggestion:" for RPM-proposed profile updates.',
    "Use transaction blocks and explicit approvals to record financial events.",
    'Reply with "approve" or "reject" to resolve pending proposals (or "approve suggestion <id>" / "reject suggestion <id>" for a specific id).',
  ];
}

export async function processInboundEmail(event: NormalizedEmailEvent): Promise<InboundProcessingResult> {
  const repo = new MemoryRepository();
  const inserted = await repo.registerInboundEvent(event.provider, event.providerEventId, event as unknown as Record<string, unknown>);

  const { user, created: userCreated } = await repo.getOrCreateUserByEmail(event.from);
  const pendingCcConfirmation = await repo.findLatestPendingCcMembershipConfirmation(user.id);
  let approvedCcCandidates: string[] = [];
  let pendingCcDecision: "approve" | "reject" | null = null;
  let rejectedPendingCc = false;
  let resolvedFromPendingKickoff = false;

  if (pendingCcConfirmation) {
    const decision = parseCcMembershipDecision(event.rawBody);
    if (decision === "approve") {
      approvedCcCandidates = pendingCcConfirmation.candidate_emails;
      pendingCcDecision = "approve";
      resolvedFromPendingKickoff = !pendingCcConfirmation.project_id;
    } else if (decision === "reject") {
      pendingCcDecision = "reject";
      rejectedPendingCc = true;
      resolvedFromPendingKickoff = !pendingCcConfirmation.project_id;
    } else {
      throw new CcMembershipConfirmationRequiredError("Pending CC membership confirmation requires explicit yes/no reply.", {
        ownerEmail: pendingCcConfirmation.owner_email,
        senderSubject: event.subject,
        candidateEmails: pendingCcConfirmation.candidate_emails,
        confirmationId: pendingCcConfirmation.id,
      });
    }
  }

  const contentEvent =
    resolvedFromPendingKickoff && pendingCcConfirmation
      ? buildContentEventFromPendingKickoff(event, pendingCcConfirmation)
      : event;

  let project: ProjectRecord;
  /** True when this inbound creates the project row (kickoff path); RPM structured rules do not apply. */
  let projectCreatedThisInbound = false;
  if (pendingCcConfirmation?.project_id) {
    const existing = await repo.findProjectById(pendingCcConfirmation.project_id);
    if (!existing) {
      throw new NonRetryableInboundError("Pending CC confirmation references an unknown project.", {
        code: "CC_CONFIRMATION_PROJECT_NOT_FOUND",
        status: 404,
      });
    }
    project = existing;
  } else if (resolvedFromPendingKickoff) {
    const created = await repo.createProjectForUser(user.id, deriveProjectName(contentEvent), {
      createdByEmail: event.from,
      createdByUserId: user.id,
    });
    project = created.project;
    projectCreatedThisInbound = true;
  } else {
    const resolved = await resolveInboundProject(repo, user.id, event, {
      currentTier: user.tier,
      ownerEmail: user.email,
      sourceInboundEventId: event.eventId,
    });
    project = resolved.project;
    projectCreatedThisInbound = resolved.created;
  }

  const ownerUserId = project.user_id;
  let inboundStoredRpmSuggestion: RPMSuggestion | null = null;

  if (!inserted && !pendingCcDecision) {
    log.info("duplicate inbound event ignored", { provider: event.provider, providerEventId: event.providerEventId });
    const projectState = await repo.getProjectState(project.id);
    const pendingSuggestions = await repo.getPendingSuggestions(ownerUserId, project.id);
    const userProfile = await repo.getUserProfile(ownerUserId);
    return {
      recipients: buildProjectEmailRecipientList(projectState),
      payload: {
        context: projectState,
        userProfile,
        pendingSuggestions,
        nextSteps: defaultNextSteps(),
        isWelcome: false,
        emailKind: "update",
      },
      outboundMode: "full",
      rpmProfileProposal: null,
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

  const ownerEmailForRole = accessState.ownerEmail ?? user.email;
  const role = resolveActorRole({
    senderEmail: event.from,
    primaryUserEmail: ownerEmailForRole,
    activeRpmEmail,
  });

  if (
    role === "rpm" &&
    !projectCreatedThisInbound &&
    shouldRequireRpmStructuredProjectClarification(contentEvent.parsed, contentEvent.rawBody)
  ) {
    throw new ClarificationRequiredError("RPM project update requires labeled sections.", {
      senderEmail: event.from,
      senderSubject: event.subject,
      intentReason: "rpm_unstructured_project_update",
      clarificationKind: "rpm_structured_project",
    });
  }

  const rpmStructuredMode = role === "rpm" && !projectCreatedThisInbound;

  const requestedProjectName = normalizeProjectNameCandidate(contentEvent.parsed.projectName || "");
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
  const existingParticipants = new Set((accessState.participants ?? []).map((email) => email.trim().toLowerCase()));
  const ownerEmailNorm = (accessState.ownerEmail ?? "").trim().toLowerCase();
  const senderEmailNorm = event.from.trim().toLowerCase();
  const activeRpmNorm = (activeRpmEmail ?? "").trim().toLowerCase();
  const newCcCandidates = participantCandidates.filter((email) => {
    const n = email.trim().toLowerCase();
    return Boolean(n) && n !== ownerEmailNorm && n !== senderEmailNorm && n !== activeRpmNorm && !existingParticipants.has(n);
  });
  if (
    !rejectedPendingCc &&
    approvedCcCandidates.length === 0 &&
    accessState.tier !== "agency" &&
    newCcCandidates.length > 0
  ) {
    const pending = await repo.createOrReusePendingCcMembershipConfirmation({
      ownerUserId,
      projectId: project.id,
      ownerEmail: accessState.ownerEmail ?? user.email,
      candidateEmails: newCcCandidates,
      sourceInboundEventId: event.eventId,
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    throw new CcMembershipConfirmationRequiredError("CC membership confirmation required before adding collaborators.", {
      ownerEmail: accessState.ownerEmail ?? user.email,
      senderSubject: event.subject,
      candidateEmails: newCcCandidates,
      confirmationId: pending.id,
    });
  }

  const filteredParticipantCandidates = filterParticipantEmailsByEntitlements({
    candidateEmails: participantCandidates,
    existingParticipantEmails: accessState.participants,
    ownerEmail: accessState.ownerEmail,
    activeRpmEmail,
    entitlements,
  });
  await repo.mergeProjectParticipants(project.id, filteredParticipantCandidates);
  if (approvedCcCandidates.length > 0) {
    await repo.mergeProjectParticipants(project.id, approvedCcCandidates);
  }

  await repo.storeRawProjectUpdate(project.id, contentEvent.rawBody, contentEvent as unknown as Record<string, unknown>);

  if (userCreated && event.fromDisplayName) {
    await repo.updateUserDisplayNameIfEmpty(user.id, event.fromDisplayName);
  }

  const priorSnapshot = await repo.getProjectState(project.id);

  const shouldRunKickoff = !project.kickoff_completed_at;
  if (shouldRunKickoff) {
    await runKickoffFlow(repo, contentEvent, user.id, project.id, accessState.tier);
  }

  const assignRpmEmail = contentEvent.parsed.assignRpmEmail?.trim() || null;
  if (assignRpmEmail) {
    const stateAfterKickoff = await repo.getProjectState(project.id);
    const entitlementsAfterKickoff = resolvePlanEntitlements(stateAfterKickoff.tier);
    const ownerEmailForAssign = stateAfterKickoff.ownerEmail ?? user.email;
    const roleForAssign = resolveActorRole({
      senderEmail: event.from,
      primaryUserEmail: ownerEmailForAssign,
      activeRpmEmail: await repo.getActiveRpm(project.id),
    });
    if (
      entitlementsAfterKickoff.package === "agency" &&
      canAssignProjectRpmViaInbound(roleForAssign, event.from, ownerEmailForAssign)
    ) {
      await repo.assignRpm(project.id, assignRpmEmail, event.from);
      await repo.appendRecentUpdate(project.id, `RPM assigned: ${assignRpmEmail}`);
    }
  }

  if (contentEvent.parsed.summary && getAllowOverviewOverride()) {
    if (!rpmStructuredMode || contentEvent.parsed.projectSectionPresence.summary) {
      await repo.updateSummaryDisplay(project.id, contentEvent.parsed.summary);
    }
  }
  if (contentEvent.parsed.projectStatus) {
    await repo.updateProjectStatus(project.id, contentEvent.parsed.projectStatus);
    const projectStatusLabel = `${contentEvent.parsed.projectStatus[0]?.toUpperCase() ?? ""}${contentEvent.parsed.projectStatus.slice(1)}`;
    await repo.appendRecentUpdate(project.id, `Project status updated: ${projectStatusLabel}`);
  }
  if (contentEvent.parsed.currentStatus) {
    await repo.updateCurrentStatus(project.id, contentEvent.parsed.currentStatus);
    await repo.appendRecentUpdate(project.id, `Status updated: ${contentEvent.parsed.currentStatus}`);
  }
  /** Labeled `Goals:` means a full snapshot for that section (replace), for any sender. */
  if (contentEvent.parsed.projectSectionPresence.goals) {
    await repo.replaceGoals(project.id, contentEvent.parsed.goals);
    if (contentEvent.parsed.goals.length > 0) {
      await repo.appendRecentUpdate(project.id, `Goals updated: ${contentEvent.parsed.goals.join("; ")}`);
    }
  } else if (!rpmStructuredMode) {
    await repo.updateGoals(project.id, contentEvent.parsed.goals);
    if (contentEvent.parsed.goals.length > 0) {
      await repo.appendRecentUpdate(project.id, `Goals updated: ${contentEvent.parsed.goals.join("; ")}`);
    }
  }
  const hasTasksOrActionItemsHeading =
    contentEvent.parsed.projectSectionPresence.tasks || contentEvent.parsed.projectSectionPresence.actionItems;
  /** Labeled `Tasks:` / `Action Items:` means a full snapshot (replace), for any sender. */
  if (hasTasksOrActionItemsHeading) {
    await repo.replaceActionItems(project.id, contentEvent.parsed.actionItems);
    if (contentEvent.parsed.actionItems.length > 0) {
      await repo.appendRecentUpdate(project.id, `Tasks updated: ${contentEvent.parsed.actionItems.join("; ")}`);
    }
  } else if (!rpmStructuredMode) {
    await repo.appendActionItems(project.id, contentEvent.parsed.actionItems);
    if (contentEvent.parsed.actionItems.length > 0) {
      await repo.appendRecentUpdate(project.id, `Task(s) added: ${contentEvent.parsed.actionItems.join("; ")}`);
    }
  }
  const stateAfterTasks = await repo.getProjectState(project.id);
  const detectedCompleted = rpmStructuredMode
    ? []
    : detectCompletedTasks(contentEvent.rawBody, stateAfterTasks.actionItems);
  const fromSection = filterCompletedToKnownTasks(contentEvent.parsed.completedTasks, stateAfterTasks.actionItems);
  const allCompleted = rpmStructuredMode
    ? contentEvent.parsed.projectSectionPresence.completed ? fromSection : []
    : mergeUniqueStringsPreserveOrder(fromSection, detectedCompleted);
  if (!rpmStructuredMode || contentEvent.parsed.projectSectionPresence.completed) {
    await repo.markTasksCompleted(project.id, allCompleted);
  }

  if (allCompleted.length > 0) {
    await repo.appendRecentUpdate(project.id, `Task(s) completed: ${allCompleted.join("; ")}`);
  }

  const stateAfterCompletion = await repo.getProjectState(project.id);
  const unmatchedCompletionNotes = rpmStructuredMode
    ? []
    : extractUnmatchedCompletionNotes(contentEvent.rawBody, allCompleted);
  const taskIntentEvents = rpmStructuredMode
    ? []
    : applyTaskIntents(
        contentEvent.rawBody,
        stateAfterCompletion.actionItems,
        stateAfterCompletion.completedTasks,
      );
  const fallbackScopeTransition =
    !rpmStructuredMode && detectProjectScopeChange(contentEvent.rawBody) ? extractScopeTransition(contentEvent.rawBody) : null;
  const scopeEvent = taskIntentEvents.find((ev) => ev.intent === "SCOPE_CHANGE");
  const scopeTransition = {
    fromScope: scopeEvent?.fromScope || fallbackScopeTransition?.fromScope,
    toScope: scopeEvent?.toScope || fallbackScopeTransition?.toScope,
  };
  const unknownNotesFromTaskIntents: string[] = [];
  if (!rpmStructuredMode) {
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
  }

  const scopeChanged =
    !rpmStructuredMode && (Boolean(scopeEvent) || detectProjectScopeChange(contentEvent.rawBody));
  if (scopeChanged) {
    const fromBrief = scopeTransition.fromScope || compactOverviewForDocument(priorSnapshot.summary).slice(0, 120) || "(previous)";
    const toBrief =
      scopeTransition.toScope ||
      contentEvent.parsed.summary?.trim() ||
      compactOverviewForDocument(contentEvent.rawBody).slice(0, 200) ||
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

  if (!rpmStructuredMode || contentEvent.parsed.projectSectionPresence.decisions) {
    await repo.updateDecisions(project.id, contentEvent.parsed.decisions);
    if (contentEvent.parsed.decisions.length > 0) {
      await repo.appendRecentUpdate(project.id, `Decision(s) added: ${contentEvent.parsed.decisions.join("; ")}`);
    }
  }
  if (!rpmStructuredMode || contentEvent.parsed.projectSectionPresence.risks) {
    await repo.updateRisks(project.id, contentEvent.parsed.risks);
    if (contentEvent.parsed.risks.length > 0) {
      await repo.appendRecentUpdate(project.id, `Risk(s) added: ${contentEvent.parsed.risks.join("; ")}`);
    }
  }
  if (!rpmStructuredMode || contentEvent.parsed.projectSectionPresence.recommendations) {
    await repo.updateRecommendations(project.id, contentEvent.parsed.recommendations);
  }
  const rpmCorrectionNotes =
    role === "rpm" && contentEvent.parsed.correction?.trim()
      ? [`RPM correction: ${contentEvent.parsed.correction.trim()}`]
      : [];
  const notesFromParsed =
    rpmStructuredMode && !contentEvent.parsed.projectSectionPresence.notes ? [] : contentEvent.parsed.notes;
  const priorNoteSources = [...notesFromParsed, ...rpmCorrectionNotes, ...unmatchedCompletionNotes];
  const filteredUnknownFromTaskIntents = filterUnknownNotesSubsumedByPriorNotes(
    unknownNotesFromTaskIntents,
    priorNoteSources,
  );
  const mergedNotes = [...notesFromParsed, ...rpmCorrectionNotes, ...unmatchedCompletionNotes, ...filteredUnknownFromTaskIntents];
  await repo.updateNotes(project.id, mergedNotes, event.timestamp);
  const meaningfulMergedNotes = mergedNotes.map((n) => n.trim()).filter((n) => n.length > 0 && !isIgnoredNoteInput(n));
  if (meaningfulMergedNotes.length > 0) {
    await repo.appendRecentUpdate(project.id, `Notes updated (${meaningfulMergedNotes.length} item${meaningfulMergedNotes.length > 1 ? "s" : ""}).`);
  }
  if (role === "rpm" && contentEvent.parsed.correction?.trim()) {
    await repo.appendRecentUpdate(
      project.id,
      `RPM correction recorded: ${contentEvent.parsed.correction.trim().slice(0, 240)}${contentEvent.parsed.correction.trim().length > 240 ? "…" : ""}`,
    );
  }
  if (!rpmStructuredMode || Boolean(contentEvent.parsed.userProfileContext?.trim())) {
    const inferredMemory = inferMemorySignals({
      summary: contentEvent.parsed.summary ?? contentEvent.rawBody,
      rawBody: contentEvent.rawBody,
      goals: contentEvent.parsed.goals,
      notes: contentEvent.parsed.notes,
    });
    await repo.mergeStructuredUserProfileContext(ownerUserId, inferredMemory.sowSignals);
    if (Object.keys(inferredMemory.constraints).length > 0) {
      await repo.patchUserProfileContextJson(ownerUserId, { constraints: inferredMemory.constraints });
    }
  }

  if (contentEvent.parsed.userProfileContext && canApplyInboundUserProfileEdit(role, event.from, ownerEmailForRole)) {
    await repo.storeUserProfileContext(ownerUserId, contentEvent.parsed.userProfileContext);
  }

  if (contentEvent.parsed.rpmSuggestion && canProposeUserProfile(role)) {
    inboundStoredRpmSuggestion = await repo.storeRPMSuggestion(
      ownerUserId,
      project.id,
      event.from,
      contentEvent.parsed.rpmSuggestion.content,
    );
  }

  for (const approval of contentEvent.parsed.approvals) {
    if (!canApplyInboundUserProfileEdit(role, event.from, ownerEmailForRole)) {
      continue;
    }
    let suggestionId = approval.suggestionId;
    if (!suggestionId) {
      const pending = await repo.getPendingSuggestions(ownerUserId, project.id);
      const next = pending[0];
      if (!next) {
        continue;
      }
      suggestionId = next.id;
    }
    if (approval.decision === "approve") {
      await repo.approveSuggestion(ownerUserId, suggestionId, event.from);
    } else {
      await repo.rejectSuggestion(ownerUserId, suggestionId, event.from);
    }
  }

  const priorAccountTier = accessState.tier;
  const accountEmailsToAdd = mergeUniqueStringsPreserveOrder(contentEvent.parsed.additionalEmails, approvedCcCandidates);
  let emailCount: number;
  try {
    emailCount = await repo.addAdditionalEmails(ownerUserId, accountEmailsToAdd);
  } catch (error) {
    if (error instanceof AdditionalEmailConflictError) {
      throw new NonRetryableInboundError("CC email is already associated with another account.", {
        code: "CC_EMAIL_OWNERSHIP_CONFLICT",
        status: 409,
      });
    }
    throw error;
  }
  await repo.addProjectMembersByEmails(project.id, ownerUserId, approvedCcCandidates);
  const nextTier = getNextTier({
    currentTier: priorAccountTier,
    hasTransactionEvent: !!contentEvent.parsed.transactionEvent,
    totalAccountEmails: emailCount,
  });

  if (nextTier !== priorAccountTier) {
    await repo.setUserTier(ownerUserId, nextTier);
    if (nextTier === "agency" && priorAccountTier !== "agency") {
      await repo.applyAgencyTierRpmTransition(ownerUserId);
    }
    if (nextTier === "solopreneur") {
      const rpmAfterTransition = await repo.getActiveRpm(project.id);
      if (!rpmAfterTransition) {
        await repo.assignRpm(project.id, getMasterUserEmail(), event.from);
      }
    }
  }

  if (pendingCcConfirmation && pendingCcDecision) {
    await repo.resolveCcMembershipConfirmation({
      confirmationId: pendingCcConfirmation.id,
      status: pendingCcDecision === "approve" ? "approved" : "rejected",
      resolvedByEmail: event.from,
    });
  }

  const effectiveTier: Tier = nextTier;

  if (contentEvent.parsed.transactionEvent) {
    const normalizedFinancials = applyTierFinancials(contentEvent.parsed.transactionEvent, effectiveTier);
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
  const recipients = buildProjectEmailRecipientList(projectState);

  const isWelcome = shouldRunKickoff;
  const playbookVariant = stableVariantIndex(project.id) as PlaybookVariant;
  const nextSteps = isWelcome
    ? [
        ...getKickoffFollowUpQuestions(projectState.projectDomain ?? "general", playbookVariant),
        ...defaultNextSteps(),
      ]
    : defaultNextSteps();

  const proposalEligible =
    !shouldRunKickoff &&
    isUserProfileSuggestionOnlyInbound(contentEvent, role) &&
    inboundStoredRpmSuggestion !== null;
  const outboundMode = proposalEligible ? "rpm_profile_proposal" : "full";

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
    outboundMode,
    rpmProfileProposal: proposalEligible ? inboundStoredRpmSuggestion : null,
    context: {
      userId: user.id,
      projectId: project.id,
      eventId: event.eventId,
      duplicate: false,
    },
  };
}
