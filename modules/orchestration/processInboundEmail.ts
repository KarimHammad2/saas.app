import {
  getMasterUserEmail,
  getOverviewRegenerationMode,
} from "@/lib/env";
import { log } from "@/lib/log";
import type {
  NormalizedEmailEvent,
  RPMSuggestion,
  Tier,
  TransactionEvent,
  TransactionPaymentMeta,
  TransactionRecord,
} from "@/modules/contracts/types";
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
  buildAdminActionConfirmation,
  buildAdminClarificationReply,
  buildAdminMenuReply,
  buildAdminNoPendingReply,
  buildAdminResultReply,
  formatAdminDocumentRows,
  formatAdminInstructionRows,
  formatAdminProjectRows,
  formatAdminProjectStateSections,
  formatAdminProjectUpdateRows,
  formatAdminRpmRows,
  formatAdminSettingRows,
  formatAdminTemplateRows,
  formatAdminTransactionRows,
  formatAdminUserRows,
  parseAdminRequest,
  type AdminActionPayload,
  type AdminEditableProjectField,
  type AdminReply,
  type AdminRequest,
} from "@/modules/orchestration/adminConversation";
import {
  adminExecutorInternals,
  executeAdminAction,
} from "@/modules/orchestration/adminActionsExecutor";
import {
  buildApprovalWaitReply,
  escalateToRPM,
  flagForReview,
  parseApprovalDecision,
  parseEscalationBlock,
  requestHumanApproval,
} from "@/modules/orchestration/escalations";
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
import { formatPaymentConfirmedPlainText } from "@/modules/output/paymentOutbound";

export interface InboundProcessingResult {
  recipients: string[];
  payload?: ProjectEmailPayload;
  /** When `rpm_profile_proposal`, send lightweight proposal mail to owner instead of full project attachment. */
  outboundMode: "full" | "rpm_profile_proposal" | "admin" | "escalation";
  /** Set when outboundMode is `rpm_profile_proposal` (inbound-stored suggestion row). */
  rpmProfileProposal: RPMSuggestion | null;
  adminReply?: AdminReply;
  escalationAction?: {
    type: "RPM" | "Review" | "Approval";
    notification?: {
      recipients: string[];
      subject: string;
      text: string;
      html?: string;
    };
    approvalId?: string;
  };
  context: {
    userId: string;
    projectId: string | null;
    eventId: string;
    duplicate: boolean;
  };
  /** Second email after a pending hour purchase: link + reply "Paid" instruction. */
  paymentInstructions?: {
    recipients: string[];
    projectCode: string;
    projectName: string;
    payment: TransactionPaymentMeta;
    activeRpmEmail: string | null;
  };
  /** After inbound "Paid": plain confirmation + optional follow-up full project file. */
  paymentConfirmed?: {
    recipients: string[];
    plainTextBody: string;
    followUpProjectPayload: ProjectEmailPayload;
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
  const parsed = parseNormalizedContent(rawBody, { timestamp: inbound.timestamp });
  return {
    ...inbound,
    subject,
    rawBody,
    parsed,
  };
}

function deriveProjectName(event: NormalizedEmailEvent): string {
  // Always run the paragraph-aware seed extractor on the full raw body so that
  // large free-form kickoffs are scored across every paragraph, not just the
  // first sentence that parseNormalizedContent fell back to as a summary.
  const rawBody = (event.rawBody ?? "").trim();
  const parsedSummary = (event.parsed.summary ?? "").trim();

  const bodyKickoff = rawBody
    ? extractKickoffSeed(rawBody)
    : { seed: null, sourcePhrase: null, sourceParagraph: null };
  if (bodyKickoff.seed) {
    return generateShortProjectName(bodyKickoff.seed, "New Project");
  }
  const fromBody = parsedSummary || bodyKickoff.sourceParagraph || rawBody;
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

function normalizeAdminActionPayload(action: AdminActionPayload): Record<string, unknown> {
  switch (action.kind) {
    case "update_tier":
      return { userEmail: action.userEmail, tier: action.tier };
    case "remove_rpm":
      return { userEmail: action.userEmail, projectName: action.projectName };
    case "assign_rpm":
      return {
        userEmail: action.userEmail,
        rpmEmail: action.rpmEmail,
        projectName: action.projectName,
      };
    case "edit_project_field":
      return {
        projectName: action.projectName,
        userEmail: action.userEmail,
        field: action.field,
        value: action.value,
      };
    case "archive_project":
    case "restore_project":
    case "delete_project":
      return { projectName: action.projectName, userEmail: action.userEmail };
    case "create_user":
      return { userEmail: action.userEmail };
    case "delete_user":
      return { userEmail: action.userEmail };
    case "create_project":
      return { projectName: action.projectName, userEmail: action.userEmail };
    case "upsert_instruction":
      return { key: action.key, content: action.content };
    case "upsert_email_template":
      return { key: action.key, patch: action.patch };
    case "upsert_system_setting":
      return { key: action.key, valueJson: action.valueJson };
  }
}

/**
 * Reconstructs an `AdminActionPayload` from the raw JSON stored on `admin_email_actions` so we can
 * route the "CONFIRM" reply through `executeAdminAction`. Returns null when the stored record is
 * malformed (treated as expired by the caller).
 */
function reconstructAdminActionPayload(
  actionKind: string,
  payload: Record<string, unknown>,
): AdminActionPayload | null {
  const asString = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
  const asEmail = (value: unknown): string | null => {
    const s = asString(value);
    return s ? s.toLowerCase() : null;
  };

  switch (actionKind) {
    case "update_tier": {
      const userEmail = asEmail(payload.userEmail);
      const tierRaw = asString(payload.tier)?.toLowerCase() ?? null;
      const tier = tierRaw === "freemium" || tierRaw === "solopreneur" || tierRaw === "agency" ? (tierRaw as Tier) : null;
      if (!userEmail || !tier) {
        return null;
      }
      return { kind: "update_tier", userEmail, tier };
    }
    case "assign_rpm": {
      const userEmail = asEmail(payload.userEmail);
      const rpmEmail = asEmail(payload.rpmEmail);
      const projectName = asString(payload.projectName);
      if (!userEmail || !rpmEmail || !projectName) {
        return null;
      }
      return { kind: "assign_rpm", userEmail, rpmEmail, projectName };
    }
    case "remove_rpm": {
      const userEmail = asEmail(payload.userEmail);
      const projectName = asString(payload.projectName);
      if (!userEmail || !projectName) {
        return null;
      }
      return { kind: "remove_rpm", userEmail, projectName };
    }
    case "edit_project_field": {
      const projectName = asString(payload.projectName);
      const fieldRaw = asString(payload.field) as AdminEditableProjectField | null;
      const value = asString(payload.value);
      if (!projectName || !fieldRaw || value === null) {
        return null;
      }
      const validFields: AdminEditableProjectField[] = [
        "summary",
        "current_status",
        "goals",
        "action_items",
        "risks",
        "notes",
      ];
      if (!validFields.includes(fieldRaw)) {
        return null;
      }
      return {
        kind: "edit_project_field",
        projectName,
        userEmail: asEmail(payload.userEmail) ?? null,
        field: fieldRaw,
        value,
      };
    }
    case "archive_project":
    case "restore_project":
    case "delete_project": {
      const projectName = asString(payload.projectName);
      if (!projectName) {
        return null;
      }
      return {
        kind: actionKind,
        projectName,
        userEmail: asEmail(payload.userEmail) ?? null,
      };
    }
    case "create_user": {
      const userEmail = asEmail(payload.userEmail);
      if (!userEmail) {
        return null;
      }
      return { kind: "create_user", userEmail };
    }
    case "delete_user": {
      const userEmail = asEmail(payload.userEmail);
      if (!userEmail) {
        return null;
      }
      return { kind: "delete_user", userEmail };
    }
    case "create_project": {
      const projectName = asString(payload.projectName);
      const userEmail = asEmail(payload.userEmail);
      if (!projectName || !userEmail) {
        return null;
      }
      return { kind: "create_project", projectName, userEmail };
    }
    case "upsert_instruction": {
      const key = asString(payload.key);
      const content = asString(payload.content);
      if (!key || content === null) {
        return null;
      }
      return { kind: "upsert_instruction", key, content };
    }
    case "upsert_email_template": {
      const key = asString(payload.key);
      const patch = payload.patch;
      if (!key || !patch || typeof patch !== "object" || Array.isArray(patch)) {
        return null;
      }
      const record = patch as Record<string, unknown>;
      const out: AdminActionPayload = {
        kind: "upsert_email_template",
        key,
        patch: {
          subject: typeof record.subject === "string" ? record.subject : undefined,
          textBody: typeof record.textBody === "string" ? record.textBody : undefined,
          htmlBody: typeof record.htmlBody === "string" ? record.htmlBody : undefined,
        },
      };
      return out;
    }
    case "upsert_system_setting": {
      const key = asString(payload.key);
      if (!key) {
        return null;
      }
      return { kind: "upsert_system_setting", key, valueJson: payload.valueJson ?? null };
    }
    default:
      return null;
  }
}

function adminNextSteps(): string[] {
  return [
    'Reply with "CONFIRM" to proceed with a pending change.',
    'Or ask another admin question like "Show me all users".',
  ];
}

async function handleAdminRequest(
  repo: MemoryRepository,
  userId: string,
  event: NormalizedEmailEvent,
  request: AdminRequest,
  pendingAdminAction: Awaited<ReturnType<MemoryRepository["findLatestPendingAdminAction"]>>,
): Promise<InboundProcessingResult | null> {
  if (request.kind === "confirm") {
    if (!pendingAdminAction) {
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminNoPendingReply(event.subject),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    const actionPayload = pendingAdminAction.action_payload as Record<string, unknown>;

    if (pendingAdminAction.action_kind === "update_tier") {
      const targetEmail = typeof actionPayload.userEmail === "string" ? actionPayload.userEmail.trim().toLowerCase() : "";
      const rawTier = typeof actionPayload.tier === "string" ? actionPayload.tier.trim().toLowerCase() : "";
      const targetTier = rawTier === "freemium" || rawTier === "solopreneur" || rawTier === "agency" ? (rawTier as Tier) : null;
      if (!targetEmail || !targetTier) {
        await repo.resolvePendingAdminAction({
          actionId: pendingAdminAction.id,
          status: "expired",
          resolvedByEmail: event.from,
        });
        return {
          recipients: [event.from],
          payload: undefined,
          outboundMode: "admin",
          rpmProfileProposal: null,
          adminReply: buildAdminClarificationReply(event.subject, "I couldn’t confirm the stored tier change."),
          context: {
            userId,
            projectId: null,
            eventId: event.eventId,
            duplicate: false,
          },
        };
      }

      const targetUser = await repo.findUserByEmail(targetEmail);
      if (!targetUser) {
        await repo.resolvePendingAdminAction({
          actionId: pendingAdminAction.id,
          status: "expired",
          resolvedByEmail: event.from,
        });
        return {
          recipients: [event.from],
          payload: undefined,
          outboundMode: "admin",
          rpmProfileProposal: null,
          adminReply: buildAdminClarificationReply(event.subject, `I couldn’t find a user for ${targetEmail}.`),
          context: {
            userId,
            projectId: null,
            eventId: event.eventId,
            duplicate: false,
          },
        };
      }

      await repo.setUserTier(targetUser.id, targetTier);
      if (targetTier === "agency") {
        await repo.applyAgencyTierRpmTransition(targetUser.id);
      }
      await repo.resolvePendingAdminAction({
        actionId: pendingAdminAction.id,
        status: "executed",
        resolvedByEmail: event.from,
      });

      const article = targetTier === "agency" ? "an" : "a";
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminResultReply(
          event.subject,
          "Done ✅",
          [`${targetEmail} is now ${article} ${targetTier[0].toUpperCase()}${targetTier.slice(1)} user.`],
          ["Assign an RPM", "View projects"],
        ),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    if (pendingAdminAction.action_kind === "assign_rpm") {
      const targetEmail = typeof actionPayload.userEmail === "string" ? actionPayload.userEmail.trim().toLowerCase() : "";
      const rpmEmail = typeof actionPayload.rpmEmail === "string" ? actionPayload.rpmEmail.trim().toLowerCase() : "";
      const projectName = typeof actionPayload.projectName === "string" ? actionPayload.projectName.trim() : "";
      if (!targetEmail || !rpmEmail || !projectName) {
        await repo.resolvePendingAdminAction({
          actionId: pendingAdminAction.id,
          status: "expired",
          resolvedByEmail: event.from,
        });
        return {
          recipients: [event.from],
          payload: undefined,
          outboundMode: "admin",
          rpmProfileProposal: null,
          adminReply: buildAdminClarificationReply(event.subject, "I couldn’t confirm the stored RPM assignment."),
          context: {
            userId,
            projectId: null,
            eventId: event.eventId,
            duplicate: false,
          },
        };
      }

      const targetUser = await repo.findUserByEmail(targetEmail);
      if (!targetUser) {
        await repo.resolvePendingAdminAction({
          actionId: pendingAdminAction.id,
          status: "expired",
          resolvedByEmail: event.from,
        });
        return {
          recipients: [event.from],
          payload: undefined,
          outboundMode: "admin",
          rpmProfileProposal: null,
          adminReply: buildAdminClarificationReply(event.subject, `I couldn’t find a user for ${targetEmail}.`),
          context: {
            userId,
            projectId: null,
            eventId: event.eventId,
            duplicate: false,
          },
        };
      }

      const ownedProjects = await repo.findProjectsOwnedByUser(targetUser.id);
      const normalizedProjectName = normalizeProjectNameCandidate(projectName);
      const matchingProjects = ownedProjects.filter(
        (project) => normalizeProjectNameCandidate(project.name) === normalizedProjectName,
      );
      const project = matchingProjects.length === 1 ? matchingProjects[0] : null;
      if (!project) {
        await repo.resolvePendingAdminAction({
          actionId: pendingAdminAction.id,
          status: "expired",
          resolvedByEmail: event.from,
        });
        return {
          recipients: [event.from],
          payload: undefined,
          outboundMode: "admin",
          rpmProfileProposal: null,
          adminReply: buildAdminClarificationReply(
            event.subject,
            `I couldn’t find a unique project named "${projectName}".`,
          ),
          context: {
            userId,
            projectId: null,
            eventId: event.eventId,
            duplicate: false,
          },
        };
      }

      await repo.assignRpm(project.id, rpmEmail, event.from);
      await repo.resolvePendingAdminAction({
        actionId: pendingAdminAction.id,
        status: "executed",
        resolvedByEmail: event.from,
      });

      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminResultReply(
          event.subject,
          "Done ✅",
          [
            `${rpmEmail} is now the RPM for ${targetEmail}.`,
            `Project: ${project.name}`,
          ],
          ["View users", "View projects"],
        ),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    if (pendingAdminAction.action_kind === "remove_rpm") {
      const targetEmail = typeof actionPayload.userEmail === "string" ? actionPayload.userEmail.trim().toLowerCase() : "";
      const projectName = typeof actionPayload.projectName === "string" ? actionPayload.projectName.trim() : "";
      if (!targetEmail || !projectName) {
        await repo.resolvePendingAdminAction({
          actionId: pendingAdminAction.id,
          status: "expired",
          resolvedByEmail: event.from,
        });
        return {
          recipients: [event.from],
          payload: undefined,
          outboundMode: "admin",
          rpmProfileProposal: null,
          adminReply: buildAdminClarificationReply(event.subject, "I couldn’t confirm the stored RPM removal."),
          context: {
            userId,
            projectId: null,
            eventId: event.eventId,
            duplicate: false,
          },
        };
      }

      const targetUser = await repo.findUserByEmail(targetEmail);
      if (!targetUser) {
        await repo.resolvePendingAdminAction({
          actionId: pendingAdminAction.id,
          status: "expired",
          resolvedByEmail: event.from,
        });
        return {
          recipients: [event.from],
          payload: undefined,
          outboundMode: "admin",
          rpmProfileProposal: null,
          adminReply: buildAdminClarificationReply(event.subject, `I couldn’t find a user for ${targetEmail}.`),
          context: {
            userId,
            projectId: null,
            eventId: event.eventId,
            duplicate: false,
          },
        };
      }

      const ownedProjects = await repo.findProjectsOwnedByUser(targetUser.id);
      const normalizedProjectName = normalizeProjectNameCandidate(projectName);
      const matchingProjects = ownedProjects.filter(
        (project) => normalizeProjectNameCandidate(project.name) === normalizedProjectName,
      );
      const project = matchingProjects.length === 1 ? matchingProjects[0] : null;
      if (!project) {
        await repo.resolvePendingAdminAction({
          actionId: pendingAdminAction.id,
          status: "expired",
          resolvedByEmail: event.from,
        });
        return {
          recipients: [event.from],
          payload: undefined,
          outboundMode: "admin",
          rpmProfileProposal: null,
          adminReply: buildAdminClarificationReply(
            event.subject,
            `I couldn’t find a unique project named "${projectName}".`,
          ),
          context: {
            userId,
            projectId: null,
            eventId: event.eventId,
            duplicate: false,
          },
        };
      }

      await repo.deactivateActiveRpm(project.id);
      await repo.resolvePendingAdminAction({
        actionId: pendingAdminAction.id,
        status: "executed",
        resolvedByEmail: event.from,
      });

      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminResultReply(
          event.subject,
          "Done ✅",
          [
            `RPM removed from ${targetEmail}.`,
            `Project: ${project.name}`,
          ],
          ["Assign an RPM", "View projects"],
        ),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    // Generic dispatcher for all other admin action kinds (edit_project_field, archive_project,
    // restore_project, delete_project, create_user, create_project, upsert_instruction,
    // upsert_email_template, upsert_system_setting).
    const reconstructed = reconstructAdminActionPayload(
      pendingAdminAction.action_kind,
      actionPayload,
    );
    if (!reconstructed) {
      await repo.resolvePendingAdminAction({
        actionId: pendingAdminAction.id,
        status: "expired",
        resolvedByEmail: event.from,
      });
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminClarificationReply(
          event.subject,
          "I couldn’t reconstruct the stored admin action. Please send the command again.",
        ),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    const execution = await executeAdminAction(repo, reconstructed, {
      actorEmail: event.from,
      adminActionId: pendingAdminAction.id,
    });

    if (!execution.ok) {
      await repo.resolvePendingAdminAction({
        actionId: pendingAdminAction.id,
        status: "expired",
        resolvedByEmail: event.from,
      });
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminClarificationReply(event.subject, execution.reason),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    await repo.resolvePendingAdminAction({
      actionId: pendingAdminAction.id,
      status: "executed",
      resolvedByEmail: event.from,
    });

    return {
      recipients: [event.from],
      payload: undefined,
      outboundMode: "admin",
      rpmProfileProposal: null,
      adminReply: buildAdminResultReply(
        event.subject,
        execution.heading,
        execution.lines,
        execution.nextSteps ?? adminNextSteps(),
      ),
      context: {
        userId,
        projectId: null,
        eventId: event.eventId,
        duplicate: false,
      },
    };
  }

  if (request.kind === "menu") {
    return {
      recipients: [event.from],
      payload: undefined,
      outboundMode: "admin",
      rpmProfileProposal: null,
      adminReply: buildAdminMenuReply(event.subject),
      context: {
        userId,
        projectId: null,
        eventId: event.eventId,
        duplicate: false,
      },
    };
  }

  if (request.kind === "show_users") {
    const users = await repo.listUsers();
    return {
      recipients: [event.from],
      payload: undefined,
      outboundMode: "admin",
      rpmProfileProposal: null,
      adminReply: buildAdminResultReply(
        event.subject,
        "Users",
        formatAdminUserRows(users.map((entry) => ({ email: entry.email, tier: entry.tier }))),
        ["You can upgrade a user or assign an RPM."],
      ),
      context: {
        userId,
        projectId: null,
        eventId: event.eventId,
        duplicate: false,
      },
    };
  }

  if (request.kind === "show_projects" || request.kind === "show_transactions" || request.kind === "show_rpm") {
    if (!request.userEmail) {
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminClarificationReply(
          event.subject,
          "Please include the user email you want me to look up.",
        ),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    const targetUser = await repo.findUserByEmail(request.userEmail);
    if (!targetUser) {
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminClarificationReply(event.subject, `I couldn’t find a user for ${request.userEmail}.`),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    const projects = await repo.findProjectsOwnedByUser(targetUser.id);
    if (request.kind === "show_projects") {
      const rows: Array<{ name: string; code: string; status: string; rpmEmail: string | null }> = [];
      for (const project of projects) {
        rows.push({
          name: project.name,
          code: project.project_code,
          status: project.status,
          rpmEmail: await repo.getActiveRpm(project.id),
        });
      }
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminResultReply(event.subject, "Projects", formatAdminProjectRows(rows), adminNextSteps()),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    if (request.kind === "show_rpm") {
      const rows: Array<{ projectName: string; rpmEmail: string | null }> = [];
      for (const project of projects) {
        rows.push({
          projectName: project.name,
          rpmEmail: await repo.getActiveRpm(project.id),
        });
      }
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminResultReply(event.subject, "RPM assignments", formatAdminRpmRows(rows), adminNextSteps()),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    const rows: Array<{ projectName: string; hours: number; rate: number; status: string; createdAt: string }> = [];
    for (const project of projects) {
      const state = await repo.getProjectState(project.id);
      for (const record of state.transactionHistory) {
        rows.push({
          projectName: state.projectName ?? project.name,
          hours: record.hoursPurchased,
          rate: record.hourlyRate,
          status: record.paymentStatus,
          createdAt: record.createdAt,
        });
      }
    }

    return {
      recipients: [event.from],
      payload: undefined,
      outboundMode: "admin",
      rpmProfileProposal: null,
      adminReply: buildAdminResultReply(
        event.subject,
        "Transactions",
        formatAdminTransactionRows(rows),
        adminNextSteps(),
      ),
      context: {
        userId,
        projectId: null,
        eventId: event.eventId,
        duplicate: false,
      },
    };
  }

  if (request.kind === "update_tier") {
    if (!request.userEmail || !request.tier) {
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminClarificationReply(
          event.subject,
          "I need both a user email and a tier (freemium, solopreneur, or agency).",
        ),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: "update_tier",
      actionPayload: normalizeAdminActionPayload({
        kind: "update_tier",
        userEmail: request.userEmail,
        tier: request.tier,
      }),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });

    return {
      recipients: [event.from],
      payload: undefined,
      outboundMode: "admin",
      rpmProfileProposal: null,
      adminReply: buildAdminActionConfirmation(event.subject, {
        kind: "update_tier",
        userEmail: request.userEmail,
        tier: request.tier,
      }),
      context: {
        userId,
        projectId: null,
        eventId: event.eventId,
        duplicate: false,
      },
    };
  }

  if (request.kind === "assign_rpm") {
    if (!request.userEmail || !request.rpmEmail) {
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminClarificationReply(
          event.subject,
          "I need both the user email and the RPM email.",
        ),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    if (!request.projectName) {
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminClarificationReply(
          event.subject,
          "I need a project name to assign the RPM to a specific project.",
        ),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: "assign_rpm",
      actionPayload: normalizeAdminActionPayload({
        kind: "assign_rpm",
        userEmail: request.userEmail,
        rpmEmail: request.rpmEmail,
        projectName: request.projectName,
      }),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });

    return {
      recipients: [event.from],
      payload: undefined,
      outboundMode: "admin",
      rpmProfileProposal: null,
      adminReply: buildAdminActionConfirmation(event.subject, {
        kind: "assign_rpm",
        userEmail: request.userEmail,
        rpmEmail: request.rpmEmail,
        projectName: request.projectName,
      }),
      context: {
        userId,
        projectId: null,
        eventId: event.eventId,
        duplicate: false,
      },
    };
  }

  if (request.kind === "remove_rpm") {
    if (!request.userEmail || !request.projectName) {
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: buildAdminClarificationReply(
          event.subject,
          "I need both the user email and the project name to remove the RPM.",
        ),
        context: {
          userId,
          projectId: null,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: "remove_rpm",
      actionPayload: normalizeAdminActionPayload({
        kind: "remove_rpm",
        userEmail: request.userEmail,
        projectName: request.projectName,
      }),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });

    return {
      recipients: [event.from],
      payload: undefined,
      outboundMode: "admin",
      rpmProfileProposal: null,
      adminReply: buildAdminActionConfirmation(event.subject, {
        kind: "remove_rpm",
        userEmail: request.userEmail,
        projectName: request.projectName,
      }),
      context: {
        userId,
        projectId: null,
        eventId: event.eventId,
        duplicate: false,
      },
    };
  }

  // ── Admin visibility (read-only) ─────────────────────────────────────────────

  const adminCtx = () => ({ userId, projectId: null, eventId: event.eventId, duplicate: false });
  const adminOut = (adminReply: AdminReply): InboundProcessingResult => ({
    recipients: [event.from],
    payload: undefined,
    outboundMode: "admin",
    rpmProfileProposal: null,
    adminReply,
    context: adminCtx(),
  });

  if (
    request.kind === "show_updates" ||
    request.kind === "show_project_state" ||
    request.kind === "show_documents"
  ) {
    if (!request.projectName) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'Please include the project name (e.g. "for project Alpha Launch").',
        ),
      );
    }
    let ownerUserId: string | null = null;
    if (request.userEmail) {
      const ownerUser = await repo.findUserByEmail(request.userEmail);
      if (!ownerUser) {
        return adminOut(
          buildAdminClarificationReply(event.subject, `I couldn’t find a user for ${request.userEmail}.`),
        );
      }
      ownerUserId = ownerUser.id;
    }
    const matches = await repo.findProjectsByName({ name: request.projectName, userId: ownerUserId });
    if (matches.length === 0) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          request.userEmail
            ? `I couldn’t find a project named "${request.projectName}" owned by ${request.userEmail}.`
            : `I couldn’t find a project named "${request.projectName}".`,
        ),
      );
    }
    if (matches.length > 1) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          `There are ${matches.length} projects named "${request.projectName}". Add "for <owner@email>" to disambiguate.`,
        ),
      );
    }
    const [project] = matches;

    if (request.kind === "show_updates") {
      const updates = await repo.listProjectUpdates(project.id);
      return adminOut(
        buildAdminResultReply(
          event.subject,
          `Updates for "${project.name}"`,
          formatAdminProjectUpdateRows(
            updates.map((row) => ({
              createdAt: row.createdAt,
              preview: row.contentPreview,
              senderEmail: row.senderEmail,
            })),
          ),
          adminNextSteps(),
        ),
      );
    }

    if (request.kind === "show_documents") {
      const docs = await repo.listOutboundDocumentEvents(project.id);
      return adminOut(
        buildAdminResultReply(
          event.subject,
          `Documents sent for "${project.name}"`,
          formatAdminDocumentRows(docs),
          adminNextSteps(),
        ),
      );
    }

    const state = await repo.getProjectState(project.id);
    return adminOut(
      buildAdminResultReply(
        event.subject,
        `Project state for "${project.name}"`,
        formatAdminProjectStateSections(
          {
            summary: state.summary,
            currentStatus: state.currentStatus,
            goals: state.goals,
            actionItems: state.actionItems,
            risks: state.risks,
            notes: state.notes,
          },
          request.sections,
        ),
        adminNextSteps(),
      ),
    );
  }

  if (request.kind === "show_settings") {
    const rows = await repo.listSystemSettings(request.keyPrefix ?? null);
    return adminOut(
      buildAdminResultReply(
        event.subject,
        request.keyPrefix ? `System settings (${request.keyPrefix}*)` : "System settings",
        formatAdminSettingRows(rows),
        adminNextSteps(),
      ),
    );
  }

  if (request.kind === "show_templates") {
    const rows = await repo.listEmailTemplates(request.key ?? null);
    return adminOut(
      buildAdminResultReply(
        event.subject,
        request.key ? `Email template "${request.key}"` : "Email templates",
        formatAdminTemplateRows(rows, Boolean(request.key)),
        adminNextSteps(),
      ),
    );
  }

  if (request.kind === "show_instructions") {
    const rows = await repo.listInstructions(request.key ?? null);
    return adminOut(
      buildAdminResultReply(
        event.subject,
        request.key ? `Instruction "${request.key}"` : "Instructions",
        formatAdminInstructionRows(rows, Boolean(request.key)),
        adminNextSteps(),
      ),
    );
  }

  // ── Admin management (write) — create pending confirmation ────────────────────

  if (request.kind === "edit_project_field") {
    if (!request.projectName || !request.field || request.value === null) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'I need a project name, a target field (goals/tasks/risks/notes/status/summary), and a value after "to".',
        ),
      );
    }
    const payload: AdminActionPayload = {
      kind: "edit_project_field",
      projectName: request.projectName,
      userEmail: request.userEmail,
      field: request.field,
      value: request.value,
    };
    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: payload.kind,
      actionPayload: normalizeAdminActionPayload(payload),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return adminOut(buildAdminActionConfirmation(event.subject, payload));
  }

  if (request.kind === "archive_project" || request.kind === "restore_project") {
    if (!request.projectName) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'Please include the project name (e.g. "Archive project Alpha Launch for user@email.com").',
        ),
      );
    }
    const payload: AdminActionPayload = {
      kind: request.kind,
      projectName: request.projectName,
      userEmail: request.userEmail,
    };
    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: payload.kind,
      actionPayload: normalizeAdminActionPayload(payload),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return adminOut(buildAdminActionConfirmation(event.subject, payload));
  }

  if (request.kind === "delete_project") {
    if (!request.projectName) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'Please include the project name (e.g. "Delete project Alpha Launch for user@email.com").',
        ),
      );
    }
    const payload: AdminActionPayload = {
      kind: "delete_project",
      projectName: request.projectName,
      userEmail: request.userEmail,
    };
    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: payload.kind,
      actionPayload: normalizeAdminActionPayload(payload),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return adminOut(buildAdminActionConfirmation(event.subject, payload));
  }

  if (request.kind === "create_user") {
    if (!request.userEmail) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'Please include the user email (e.g. "Create user alice@example.com").',
        ),
      );
    }
    const payload: AdminActionPayload = {
      kind: "create_user",
      userEmail: request.userEmail,
    };
    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: payload.kind,
      actionPayload: normalizeAdminActionPayload(payload),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return adminOut(buildAdminActionConfirmation(event.subject, payload));
  }

  if (request.kind === "delete_user") {
    if (!request.userEmail) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'Please include the user email (e.g. "Delete user alice@example.com").',
        ),
      );
    }
    const targetEmailNormalized = request.userEmail.trim().toLowerCase();
    if (targetEmailNormalized === getMasterUserEmail()) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          "I can’t delete the master admin account.",
        ),
      );
    }
    const payload: AdminActionPayload = {
      kind: "delete_user",
      userEmail: request.userEmail,
    };
    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: payload.kind,
      actionPayload: normalizeAdminActionPayload(payload),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return adminOut(buildAdminActionConfirmation(event.subject, payload));
  }

  if (request.kind === "create_project") {
    if (!request.projectName || !request.userEmail) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'Please include both the project name and owner email (e.g. "Create project Alpha Launch for alice@example.com").',
        ),
      );
    }
    const payload: AdminActionPayload = {
      kind: "create_project",
      projectName: request.projectName,
      userEmail: request.userEmail,
    };
    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: payload.kind,
      actionPayload: normalizeAdminActionPayload(payload),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return adminOut(buildAdminActionConfirmation(event.subject, payload));
  }

  if (request.kind === "upsert_instruction") {
    if (!request.key || request.content === null) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'I need an instruction key and a value after "to" (e.g. "Set instruction llm_document_usage to: ...").',
        ),
      );
    }
    const payload: AdminActionPayload = {
      kind: "upsert_instruction",
      key: request.key,
      content: request.content,
    };
    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: payload.kind,
      actionPayload: normalizeAdminActionPayload(payload),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return adminOut(buildAdminActionConfirmation(event.subject, payload));
  }

  if (request.kind === "upsert_email_template") {
    if (!request.key || !request.field || request.value === null) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'I need a template key, a field (subject, text, or html), and a value after "to".',
        ),
      );
    }
    const patch =
      request.field === "subject"
        ? { subject: request.value }
        : request.field === "html"
          ? { htmlBody: request.value }
          : { textBody: request.value };
    const payload: AdminActionPayload = {
      kind: "upsert_email_template",
      key: request.key,
      patch,
    };
    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: payload.kind,
      actionPayload: normalizeAdminActionPayload(payload),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return adminOut(buildAdminActionConfirmation(event.subject, payload));
  }

  if (request.kind === "upsert_system_setting") {
    if (!request.key || request.rawValue === null) {
      return adminOut(
        buildAdminClarificationReply(
          event.subject,
          'I need a setting key and a value after "to" (e.g. "Set setting email.admin_bcc.enabled to true").',
        ),
      );
    }
    const payload: AdminActionPayload = {
      kind: "upsert_system_setting",
      key: request.key,
      valueJson: adminExecutorInternals.parseSettingValue(request.rawValue),
    };
    await repo.createOrReusePendingAdminAction({
      senderUserId: userId,
      senderEmail: event.from,
      actionKind: payload.kind,
      actionPayload: normalizeAdminActionPayload(payload),
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return adminOut(buildAdminActionConfirmation(event.subject, payload));
  }

  return null;
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
  if (parsed.paymentReceivedAck) {
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

function ensureOwnerRecipient(recipients: string[], ownerEmail: string | null | undefined): string[] {
  const normalizedOwner = ownerEmail?.trim().toLowerCase() ?? "";
  if (!normalizedOwner || !normalizedOwner.includes("@")) {
    return recipients;
  }
  const normalized = recipients.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (normalized.includes(normalizedOwner)) {
    return Array.from(new Set(normalized));
  }
  return [normalizedOwner, ...normalized];
}

function ensureSenderRecipient(recipients: string[], senderEmail: string): string[] {
  const normalizedSender = senderEmail.trim().toLowerCase();
  if (!normalizedSender || !normalizedSender.includes("@")) {
    return recipients;
  }
  const normalized = recipients.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (normalized.includes(normalizedSender)) {
    return Array.from(new Set(normalized));
  }
  return [normalizedSender, ...normalized];
}

function buildEscalationProjectSummary(projectState: {
  projectName?: string;
  summary: string;
  currentStatus: string;
  goals: string[];
  actionItems: string[];
  decisions: string[];
  risks: string[];
  recommendations: string[];
}): string {
  return [
    projectState.projectName ? `Project: ${projectState.projectName}` : null,
    projectState.summary.trim() ? `Summary: ${projectState.summary.trim()}` : null,
    projectState.currentStatus.trim() ? `Current Status: ${projectState.currentStatus.trim()}` : null,
    projectState.goals.length > 0 ? `Goals: ${projectState.goals.join("; ")}` : null,
    projectState.actionItems.length > 0 ? `Tasks: ${projectState.actionItems.join("; ")}` : null,
    projectState.decisions.length > 0 ? `Decisions: ${projectState.decisions.join("; ")}` : null,
    projectState.risks.length > 0 ? `Risks: ${projectState.risks.join("; ")}` : null,
    projectState.recommendations.length > 0 ? `Recommendations: ${projectState.recommendations.join("; ")}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export async function processInboundEmail(event: NormalizedEmailEvent): Promise<InboundProcessingResult> {
  const repo = new MemoryRepository();
  const inserted = await repo.registerInboundEvent(event.provider, event.providerEventId, event as unknown as Record<string, unknown>);

  const { user, created: userCreated } = await repo.getOrCreateUserByEmail(event.from);
  const senderNormalized = event.from.trim().toLowerCase();
  const masterEmail = getMasterUserEmail();
  const senderIsMaster = senderNormalized === masterEmail;
  const adminRequest = senderIsMaster ? parseAdminRequest(event.rawBody) : null;
  const pendingAdminAction = senderIsMaster ? await repo.findLatestPendingAdminAction(user.id) : null;
  const pendingHumanApproval = await repo.findLatestPendingApproval(senderNormalized);

  if (!inserted && senderIsMaster && (adminRequest || pendingAdminAction)) {
    return {
      recipients: [event.from],
      payload: undefined,
      outboundMode: "admin",
      rpmProfileProposal: null,
      context: {
        userId: user.id,
        projectId: null,
        eventId: event.eventId,
        duplicate: true,
      },
    };
  }

  if (pendingHumanApproval) {
    const approvalDecision = parseApprovalDecision(event.rawBody);
    if (approvalDecision) {
      await repo.resolvePendingApproval({
        approvalId: pendingHumanApproval.id,
        status: approvalDecision === "approve" ? "approved" : "rejected",
        resolvedByEmail: event.from,
      });

      const label = pendingHumanApproval.action.trim().replace(/_/g, " ");
      const approvalReply: AdminReply = {
        subject: `Re: Approval requested: ${label[0]?.toUpperCase() ?? ""}${label.slice(1)}`,
        text: [
          `Approval ${approvalDecision} recorded.`,
          "",
          `Action: ${label}`,
          `Reason: ${pendingHumanApproval.reason}`,
          "",
          "-- Frank",
        ].join("\n"),
        html: [
          `<p>Approval <strong>${approvalDecision}</strong> recorded.</p>`,
          `<p><strong>Action:</strong> ${label}<br>`,
          `<strong>Reason:</strong> ${pendingHumanApproval.reason}</p>`,
          "<p>&mdash; Frank</p>",
        ].join(""),
      };

      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "admin",
        rpmProfileProposal: null,
        adminReply: approvalReply,
        context: {
          userId: user.id,
          projectId: pendingHumanApproval.project_id,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    return {
      recipients: [event.from],
      payload: undefined,
      outboundMode: "admin",
      rpmProfileProposal: null,
      adminReply: buildApprovalWaitReply(pendingHumanApproval.action, pendingHumanApproval.reason),
      context: {
        userId: user.id,
        projectId: pendingHumanApproval.project_id,
        eventId: event.eventId,
        duplicate: false,
      },
    };
  }

  if (senderIsMaster && adminRequest && (adminRequest.kind !== "confirm" || pendingAdminAction)) {
    const adminResult = await handleAdminRequest(repo, user.id, event, adminRequest, pendingAdminAction);
    if (adminResult) {
      return adminResult;
    }
  }

  const pendingCcConfirmation = await repo.findLatestPendingCcMembershipConfirmation(user.id);
  let approvedCcCandidates: string[] = [];
  let pendingCcDecision: "approve" | "reject" | null = null;
  let rejectedPendingCc = false;
  let resolvedFromPendingKickoff = false;
  let recordedTransactionEvent: TransactionEvent | null = null;
  let recordedTransactionPayment: TransactionPaymentMeta | null = null;
  let paymentConfirmedRecord: TransactionRecord | null = null;

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
    const ownerRecipient = projectState.ownerEmail ?? (await repo.getUserEmailById(ownerUserId));
    return {
      recipients: ensureSenderRecipient(
        ensureOwnerRecipient(buildProjectEmailRecipientList(projectState), ownerRecipient),
        event.from,
      ),
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
  const ownerEmailResolved = accessState.ownerEmail ?? (await repo.getUserEmailById(ownerUserId));
  const ownerAccountEmails = await repo.getUserEmailsById(ownerUserId);
  const activeRpmEmail = await repo.getActiveRpm(project.id);
  const senderMatchesOwnerAlias = ownerAccountEmails.some((email) => email.trim().toLowerCase() === senderNormalized);
  if (
    !senderMatchesOwnerAlias &&
    !canSenderUpdateProject({
      senderEmail: event.from,
      ownerEmail: ownerEmailResolved,
      participantEmails: accessState.participants,
      activeRpmEmail,
    })
  ) {
    throw new NonRetryableInboundError("Sender is not allowed to update this project.", {
      code: "PROJECT_ACCESS_DENIED",
      status: 403,
    });
  }

  const ownerEmailForRole = ownerEmailResolved ?? user.email;
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
  const escalationBlock = parseEscalationBlock(contentEvent.rawBody);
  if (escalationBlock) {
    const escalationRpmEmail = activeRpmEmail ?? getMasterUserEmail();
    const escalationProjectSummary = buildEscalationProjectSummary(accessState);

    if (escalationBlock.type === "RPM") {
      const { notification } = await escalateToRPM(repo, {
        projectId: project.id,
        rpmEmail: escalationRpmEmail,
        reason: escalationBlock.reason,
        projectSummary: escalationProjectSummary,
        senderEmail: event.from,
      });
      return {
        recipients: notification.recipients,
        payload: undefined,
        outboundMode: "escalation",
        rpmProfileProposal: null,
        escalationAction: {
          type: "RPM",
          notification,
        },
        context: {
          userId: user.id,
          projectId: project.id,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    if (escalationBlock.type === "Review") {
      await flagForReview(repo, {
        projectId: project.id,
        reason: escalationBlock.reason,
      });
      return {
        recipients: [event.from],
        payload: undefined,
        outboundMode: "escalation",
        rpmProfileProposal: null,
        escalationAction: {
          type: "Review",
        },
        context: {
          userId: user.id,
          projectId: project.id,
          eventId: event.eventId,
          duplicate: false,
        },
      };
    }

    const { approval, notification } = await requestHumanApproval(repo, {
      projectId: project.id,
      rpmEmail: escalationRpmEmail,
      action: "hire_developer",
      reason: escalationBlock.reason,
      projectSummary: escalationProjectSummary,
      senderEmail: event.from,
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    return {
      recipients: notification.recipients,
      payload: undefined,
      outboundMode: "escalation",
      rpmProfileProposal: null,
      escalationAction: {
        type: "Approval",
        notification,
        approvalId: approval.id,
      },
      context: {
        userId: user.id,
        projectId: project.id,
        eventId: event.eventId,
        duplicate: false,
      },
    };
  }

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
      ownerEmail: ownerEmailForRole,
      candidateEmails: newCcCandidates,
      sourceInboundEventId: event.eventId,
      sourceSubject: event.subject,
      sourceRawBody: event.rawBody,
    });
    throw new CcMembershipConfirmationRequiredError("CC membership confirmation required before adding collaborators.", {
      ownerEmail: ownerEmailForRole,
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
    const ownerEmailForAssign = stateAfterKickoff.ownerEmail ?? (await repo.getUserEmailById(ownerUserId)) ?? user.email;
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

  if (contentEvent.parsed.summary) {
    await repo.updateSummaryDisplay(project.id, contentEvent.parsed.summary);
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
  const parsedFollowUps = contentEvent.parsed.followUps ?? [];
  if (parsedFollowUps.length > 0) {
    await repo.storeFollowUps(project.id, parsedFollowUps, event.eventId);
    await repo.appendRecentUpdate(
      project.id,
      `Follow-up(s) added: ${parsedFollowUps.map((item) => item.action).join("; ")}`,
    );
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
      const approvedTx = await repo.approveSuggestion(ownerUserId, suggestionId, event.from);
      if (approvedTx) {
        recordedTransactionEvent = approvedTx.event;
        recordedTransactionPayment = approvedTx.payment;
      }
    } else {
      await repo.rejectSuggestion(ownerUserId, suggestionId, event.from);
    }
  }

  const priorAccountTier = accessState.tier;
  // Explicit "Team Emails/Additional Emails" are account aliases.
  // CC-approved emails are treated as members and should not be claimed as aliases,
  // because many of them already belong to other user accounts.
  const accountEmailsToAdd = contentEvent.parsed.additionalEmails;
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
  const tierEmailCount = emailCount + approvedCcCandidates.length;
  const nextTier = getNextTier({
    currentTier: priorAccountTier,
    hasTransactionEvent: !!contentEvent.parsed.transactionEvent,
    totalAccountEmails: tierEmailCount,
  });

  if (nextTier !== priorAccountTier) {
    await repo.setUserTier(ownerUserId, nextTier);
    if (nextTier === "agency" && priorAccountTier !== "agency") {
      await repo.applyAgencyTierRpmTransition(ownerUserId);
    }
  }

  if (pendingCcConfirmation && pendingCcDecision) {
    await repo.resolveCcMembershipConfirmation({
      confirmationId: pendingCcConfirmation.id,
      status: pendingCcDecision === "approve" ? "approved" : "rejected",
      resolvedByEmail: event.from,
    });
  }

  const financialTier: Tier = nextTier === "agency" || priorAccountTier === "agency" ? "agency" : "solopreneur";

  if (
    contentEvent.parsed.paymentReceivedAck === true &&
    !contentEvent.parsed.transactionEvent &&
    canApproveTransaction(role)
  ) {
    const paidRow = await repo.markLatestPendingHourPurchasePaid(project.id, event.from);
    if (paidRow) {
      paymentConfirmedRecord = paidRow;
      if (priorAccountTier === "freemium") {
        await repo.setUserTier(ownerUserId, "solopreneur");
      }
      const tierAfterPayment = priorAccountTier === "freemium" ? "solopreneur" : priorAccountTier;
      if (tierAfterPayment === "solopreneur") {
        const rpmAfterPayment = await repo.getActiveRpm(project.id);
        if (!rpmAfterPayment) {
          await repo.assignRpm(project.id, getMasterUserEmail(), event.from);
        }
      }
      await repo.appendRecentUpdate(project.id, "Payment confirmed for latest hour purchase.");
    }
  }

  if (contentEvent.parsed.transactionEvent) {
    const normalizedFinancials = applyTierFinancials(contentEvent.parsed.transactionEvent, financialTier);
    if (!canApproveTransaction(role)) {
      const pending = await repo.storeProtectedTransactionSuggestion(ownerUserId, project.id, event.from, normalizedFinancials);
      await repo.appendRecentUpdate(
        project.id,
        `Protected transaction proposed [${pending.id}] by ${event.from}. Awaiting explicit approval.`,
      );
    } else {
      recordedTransactionPayment = await repo.storeTransactionEvent(project.id, event.from, normalizedFinancials);
      recordedTransactionEvent = normalizedFinancials;
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

  const pendingSuggestions: RPMSuggestion[] = await repo.getPendingSuggestions(ownerUserId, project.id);
  const lastContactAt = await repo.updateProjectLastContactAt(project.id);
  const projectState = {
    ...projectStateForRpm,
    usageCount: projectStateForRpm.usageCount + 1,
    lastContactAt,
  };
  const ownerRecipient = projectState.ownerEmail ?? (await repo.getUserEmailById(ownerUserId));
  const recipients = ensureSenderRecipient(
    ensureOwnerRecipient(buildProjectEmailRecipientList(projectState), ownerRecipient),
    event.from,
  );

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

  const payload: ProjectEmailPayload = {
    context: projectState,
    userProfile: userProfileForRpm,
    pendingSuggestions,
    nextSteps,
    isWelcome,
    emailKind: isWelcome ? "kickoff" : "update",
    ...(recordedTransactionEvent && recordedTransactionPayment
      ? {
          recordedTransaction: {
            event: recordedTransactionEvent,
            remainderBalance: projectState.remainderBalance,
            ...recordedTransactionPayment,
          },
        }
      : {}),
  };

  const projectCodeTrimmed = projectState.projectCode?.trim();
  const paymentInstructions =
    recordedTransactionEvent && recordedTransactionPayment && projectCodeTrimmed
      ? {
          recipients,
          projectCode: projectCodeTrimmed,
          projectName: (projectState.projectName ?? "Untitled Project").trim() || "Untitled Project",
          payment: recordedTransactionPayment,
          activeRpmEmail: projectState.activeRpmEmail ?? null,
        }
      : undefined;

  const paymentConfirmed =
    paymentConfirmedRecord && projectCodeTrimmed
      ? {
          recipients,
          plainTextBody: formatPaymentConfirmedPlainText(projectState, paymentConfirmedRecord),
          followUpProjectPayload: {
            context: projectState,
            userProfile: userProfileForRpm,
            pendingSuggestions,
            nextSteps: defaultNextSteps(),
            isWelcome: false,
            emailKind: "update" as const,
          },
        }
      : undefined;

  return {
    recipients,
    payload,
    outboundMode,
    rpmProfileProposal: proposalEligible ? inboundStoredRpmSuggestion : null,
    context: {
      userId: user.id,
      projectId: project.id,
      eventId: event.eventId,
      duplicate: false,
    },
    ...(paymentInstructions ? { paymentInstructions } : {}),
    ...(paymentConfirmed ? { paymentConfirmed } : {}),
  };
}
