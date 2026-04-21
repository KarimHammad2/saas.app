import type { Tier } from "@/modules/contracts/types";
import { normalizeProjectNameCandidate } from "@/modules/domain/projectName";
import type { MemoryRepository } from "@/modules/memory/repository";
import type {
  AdminActionPayload,
  AdminEditableProjectField,
  AdminEmailTemplatePatch,
} from "@/modules/orchestration/adminConversation";

/** Result surface for the executor: either a success message or a clarification reason. */
export type AdminExecutionResult =
  | { ok: true; heading: string; lines: string[]; nextSteps?: string[] }
  | { ok: false; reason: string };

function parseListValue(value: string): string[] {
  return value
    .split(/\n|;|\s*\|\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSettingValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Treat bare "true"/"false"/numbers naturally; fall back to wrapping arbitrary text.
    if (/^(?:true|false)$/i.test(trimmed)) {
      return trimmed.toLowerCase() === "true";
    }
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }
}

function formatListPreview(items: string[]): string {
  if (items.length === 0) {
    return "(empty)";
  }
  const preview = items.slice(0, 3).join("; ");
  return items.length > 3 ? `${preview}; …` : preview;
}

function describeField(field: AdminEditableProjectField): string {
  switch (field) {
    case "summary":
      return "Summary";
    case "current_status":
      return "Current Status";
    case "goals":
      return "Goals";
    case "action_items":
      return "Tasks";
    case "risks":
      return "Risks";
    case "notes":
      return "Notes";
  }
}

/**
 * Admin project lookup uses project **name** (per SOW). When an owner email is provided we scope
 * to that owner; otherwise we require a globally unique match to avoid acting on the wrong project.
 */
async function resolveAdminProjectByName(
  repo: MemoryRepository,
  projectName: string,
  userEmail: string | null,
): Promise<
  | { ok: true; project: { id: string; name: string; user_id: string; archived_at?: string | null } }
  | { ok: false; reason: string }
> {
  const normalizedName = normalizeProjectNameCandidate(projectName);
  if (!normalizedName) {
    return { ok: false, reason: `Project name "${projectName}" is not recognizable.` };
  }

  let userId: string | null = null;
  if (userEmail) {
    const user = await repo.findUserByEmail(userEmail);
    if (!user) {
      return { ok: false, reason: `I couldn’t find a user for ${userEmail}.` };
    }
    userId = user.id;
  }

  const matches = await repo.findProjectsByName({ name: normalizedName, userId });
  if (matches.length === 0) {
    return {
      ok: false,
      reason: userEmail
        ? `I couldn’t find a project named "${normalizedName}" owned by ${userEmail}.`
        : `I couldn’t find a project named "${normalizedName}".`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: `There are ${matches.length} projects named "${normalizedName}". Please re-send with "for <owner@email>" to disambiguate.`,
    };
  }
  const [project] = matches;
  return { ok: true, project };
}

async function executeEditProjectField(
  repo: MemoryRepository,
  action: Extract<AdminActionPayload, { kind: "edit_project_field" }>,
  context: { actorEmail: string; adminActionId?: string | null },
): Promise<AdminExecutionResult> {
  const lookup = await resolveAdminProjectByName(repo, action.projectName, action.userEmail);
  if (!lookup.ok) {
    return lookup;
  }
  const project = lookup.project;

  const before = await repo.getProjectState(project.id);
  let appliedValueSummary = action.value;
  let afterJson: Record<string, unknown> = {};
  let beforeJson: Record<string, unknown> = {};

  switch (action.field) {
    case "summary": {
      await repo.replaceProjectSummary(project.id, action.value);
      beforeJson = { summary: before.summary };
      afterJson = { summary: action.value };
      break;
    }
    case "current_status": {
      await repo.replaceProjectCurrentStatus(project.id, action.value);
      beforeJson = { currentStatus: before.currentStatus };
      afterJson = { currentStatus: action.value };
      break;
    }
    case "goals": {
      const items = parseListValue(action.value);
      await repo.replaceGoals(project.id, items);
      beforeJson = { goals: before.goals };
      afterJson = { goals: items };
      appliedValueSummary = formatListPreview(items);
      break;
    }
    case "action_items": {
      const items = parseListValue(action.value);
      await repo.replaceActionItems(project.id, items);
      beforeJson = { actionItems: before.actionItems };
      afterJson = { actionItems: items };
      appliedValueSummary = formatListPreview(items);
      break;
    }
    case "risks": {
      const items = parseListValue(action.value);
      await repo.replaceProjectRisks(project.id, items);
      beforeJson = { risks: before.risks };
      afterJson = { risks: items };
      appliedValueSummary = formatListPreview(items);
      break;
    }
    case "notes": {
      const items = parseListValue(action.value);
      await repo.replaceProjectNotes(project.id, items);
      beforeJson = { notes: before.notes };
      afterJson = { notes: items };
      appliedValueSummary = formatListPreview(items);
      break;
    }
  }

  await repo.recordAdminAuditLog({
    adminActionId: context.adminActionId ?? null,
    actorEmail: context.actorEmail,
    actionKind: `edit_project_field:${action.field}`,
    entityType: "project",
    entityRef: project.name,
    beforeJson,
    afterJson,
  });

  return {
    ok: true,
    heading: "Done ✅",
    lines: [
      `Updated ${describeField(action.field)} on "${project.name}".`,
      `New value: ${appliedValueSummary}`,
    ],
    nextSteps: [
      `Show goals for project ${project.name}`,
      `Show updates for project ${project.name}`,
    ],
  };
}

async function executeProjectLifecycle(
  repo: MemoryRepository,
  action: Extract<AdminActionPayload, { kind: "archive_project" | "restore_project" }>,
  context: { actorEmail: string; adminActionId?: string | null },
): Promise<AdminExecutionResult> {
  const lookup = await resolveAdminProjectByName(repo, action.projectName, action.userEmail);
  if (!lookup.ok) {
    return lookup;
  }
  const project = lookup.project;
  const before = { archivedAt: project.archived_at ?? null };

  if (action.kind === "archive_project") {
    if (project.archived_at) {
      return {
        ok: true,
        heading: "Already archived",
        lines: [`Project "${project.name}" was already archived on ${project.archived_at.slice(0, 10)}.`],
      };
    }
    const archivedAt = new Date().toISOString();
    await repo.setProjectArchived(project.id, archivedAt);
    await repo.recordAdminAuditLog({
      adminActionId: context.adminActionId ?? null,
      actorEmail: context.actorEmail,
      actionKind: "archive_project",
      entityType: "project",
      entityRef: project.name,
      beforeJson: before,
      afterJson: { archivedAt },
    });
    return {
      ok: true,
      heading: "Done ✅",
      lines: [`Project "${project.name}" is now archived.`],
      nextSteps: [`Restore project ${project.name}`],
    };
  }

  if (!project.archived_at) {
    return {
      ok: true,
      heading: "Already active",
      lines: [`Project "${project.name}" is already active.`],
    };
  }
  await repo.setProjectArchived(project.id, null);
  await repo.recordAdminAuditLog({
    adminActionId: context.adminActionId ?? null,
    actorEmail: context.actorEmail,
    actionKind: "restore_project",
    entityType: "project",
    entityRef: project.name,
    beforeJson: before,
    afterJson: { archivedAt: null },
  });
  return {
    ok: true,
    heading: "Done ✅",
    lines: [`Project "${project.name}" has been restored and is now active.`],
    nextSteps: [`Show projects for ${action.userEmail ?? "the owner"}`],
  };
}

async function executeUpsertInstruction(
  repo: MemoryRepository,
  action: Extract<AdminActionPayload, { kind: "upsert_instruction" }>,
  context: { actorEmail: string; adminActionId?: string | null },
): Promise<AdminExecutionResult> {
  const result = await repo.upsertInstruction(action.key, action.content);
  await repo.recordAdminAuditLog({
    adminActionId: context.adminActionId ?? null,
    actorEmail: context.actorEmail,
    actionKind: "upsert_instruction",
    entityType: "instruction",
    entityRef: result.key,
    beforeJson: { content: result.previous },
    afterJson: { content: result.content },
  });
  return {
    ok: true,
    heading: "Done ✅",
    lines: [`Instruction "${result.key}" was updated.`],
    nextSteps: [`Show instruction ${result.key}`],
  };
}

async function executeUpsertEmailTemplate(
  repo: MemoryRepository,
  action: Extract<AdminActionPayload, { kind: "upsert_email_template" }>,
  context: { actorEmail: string; adminActionId?: string | null },
): Promise<AdminExecutionResult> {
  const patch: AdminEmailTemplatePatch = action.patch;
  if (patch.subject === undefined && patch.textBody === undefined && patch.htmlBody === undefined) {
    return { ok: false, reason: "No template field was provided (use subject, text, or html)." };
  }
  const result = await repo.upsertEmailTemplate(action.key, patch);
  await repo.recordAdminAuditLog({
    adminActionId: context.adminActionId ?? null,
    actorEmail: context.actorEmail,
    actionKind: "upsert_email_template",
    entityType: "email_template",
    entityRef: result.key,
    beforeJson: result.previous ?? null,
    afterJson: { subject: result.subject, textBody: result.textBody, htmlBody: result.htmlBody },
  });
  return {
    ok: true,
    heading: "Done ✅",
    lines: [`Email template "${result.key}" was updated.`],
    nextSteps: [`Show template ${result.key}`],
  };
}

async function executeUpsertSystemSetting(
  repo: MemoryRepository,
  action: Extract<AdminActionPayload, { kind: "upsert_system_setting" }>,
  context: { actorEmail: string; adminActionId?: string | null },
): Promise<AdminExecutionResult> {
  const result = await repo.upsertSystemSetting(action.key, action.valueJson);
  await repo.recordAdminAuditLog({
    adminActionId: context.adminActionId ?? null,
    actorEmail: context.actorEmail,
    actionKind: "upsert_system_setting",
    entityType: "system_setting",
    entityRef: result.key,
    beforeJson: { valueJson: result.previous },
    afterJson: { valueJson: result.valueJson },
  });
  return {
    ok: true,
    heading: "Done ✅",
    lines: [`Setting "${result.key}" was updated to ${JSON.stringify(result.valueJson)}.`],
    nextSteps: [`Show setting ${result.key}`],
  };
}

async function executeUpdateTier(
  repo: MemoryRepository,
  action: Extract<AdminActionPayload, { kind: "update_tier" }>,
  context: { actorEmail: string; adminActionId?: string | null },
): Promise<AdminExecutionResult> {
  const user = await repo.findUserByEmail(action.userEmail);
  if (!user) {
    return { ok: false, reason: `I couldn’t find a user for ${action.userEmail}.` };
  }
  const previousTier = user.tier as Tier;
  await repo.setUserTier(user.id, action.tier);
  if (action.tier === "agency") {
    await repo.applyAgencyTierRpmTransition(user.id);
  }
  await repo.recordAdminAuditLog({
    adminActionId: context.adminActionId ?? null,
    actorEmail: context.actorEmail,
    actionKind: "update_tier",
    entityType: "user",
    entityRef: action.userEmail,
    beforeJson: { tier: previousTier },
    afterJson: { tier: action.tier },
  });
  const article = action.tier === "agency" ? "an" : "a";
  return {
    ok: true,
    heading: "Done ✅",
    lines: [`${action.userEmail} is now ${article} ${action.tier[0].toUpperCase()}${action.tier.slice(1)} user.`],
    nextSteps: ["Assign an RPM", "View projects"],
  };
}

async function executeAssignRpm(
  repo: MemoryRepository,
  action: Extract<AdminActionPayload, { kind: "assign_rpm" }>,
  context: { actorEmail: string; adminActionId?: string | null },
): Promise<AdminExecutionResult> {
  const user = await repo.findUserByEmail(action.userEmail);
  if (!user) {
    return { ok: false, reason: `I couldn’t find a user for ${action.userEmail}.` };
  }
  const lookup = await resolveAdminProjectByName(repo, action.projectName, action.userEmail);
  if (!lookup.ok) {
    return lookup;
  }
  if (lookup.project.user_id !== user.id) {
    return {
      ok: false,
      reason: `Project "${lookup.project.name}" is not owned by ${action.userEmail}.`,
    };
  }
  const previousRpm = await repo.getActiveRpm(lookup.project.id);
  await repo.assignRpm(lookup.project.id, action.rpmEmail, context.actorEmail);
  await repo.recordAdminAuditLog({
    adminActionId: context.adminActionId ?? null,
    actorEmail: context.actorEmail,
    actionKind: "assign_rpm",
    entityType: "project",
    entityRef: lookup.project.name,
    beforeJson: { rpmEmail: previousRpm },
    afterJson: { rpmEmail: action.rpmEmail },
  });
  return {
    ok: true,
    heading: "Done ✅",
    lines: [
      `${action.rpmEmail} is now the RPM for ${action.userEmail}.`,
      `Project: ${lookup.project.name}`,
    ],
    nextSteps: ["View users", "View projects"],
  };
}

async function executeRemoveRpm(
  repo: MemoryRepository,
  action: Extract<AdminActionPayload, { kind: "remove_rpm" }>,
  context: { actorEmail: string; adminActionId?: string | null },
): Promise<AdminExecutionResult> {
  const user = await repo.findUserByEmail(action.userEmail);
  if (!user) {
    return { ok: false, reason: `I couldn’t find a user for ${action.userEmail}.` };
  }
  const lookup = await resolveAdminProjectByName(repo, action.projectName, action.userEmail);
  if (!lookup.ok) {
    return lookup;
  }
  if (lookup.project.user_id !== user.id) {
    return {
      ok: false,
      reason: `Project "${lookup.project.name}" is not owned by ${action.userEmail}.`,
    };
  }
  const previousRpm = await repo.getActiveRpm(lookup.project.id);
  await repo.deactivateActiveRpm(lookup.project.id);
  await repo.recordAdminAuditLog({
    adminActionId: context.adminActionId ?? null,
    actorEmail: context.actorEmail,
    actionKind: "remove_rpm",
    entityType: "project",
    entityRef: lookup.project.name,
    beforeJson: { rpmEmail: previousRpm },
    afterJson: { rpmEmail: null },
  });
  return {
    ok: true,
    heading: "Done ✅",
    lines: [
      `RPM removed from ${action.userEmail}.`,
      `Project: ${lookup.project.name}`,
    ],
    nextSteps: ["Assign an RPM", "View projects"],
  };
}

export async function executeAdminAction(
  repo: MemoryRepository,
  action: AdminActionPayload,
  context: { actorEmail: string; adminActionId?: string | null },
): Promise<AdminExecutionResult> {
  switch (action.kind) {
    case "update_tier":
      return executeUpdateTier(repo, action, context);
    case "assign_rpm":
      return executeAssignRpm(repo, action, context);
    case "remove_rpm":
      return executeRemoveRpm(repo, action, context);
    case "edit_project_field":
      return executeEditProjectField(repo, action, context);
    case "archive_project":
    case "restore_project":
      return executeProjectLifecycle(repo, action, context);
    case "upsert_instruction":
      return executeUpsertInstruction(repo, action, context);
    case "upsert_email_template":
      return executeUpsertEmailTemplate(repo, action, context);
    case "upsert_system_setting":
      return executeUpsertSystemSetting(repo, action, context);
  }
}

/** Helpers used by the parser -> confirmation pipeline to reuse the same JSON parsing rules. */
export const adminExecutorInternals = {
  parseListValue,
  parseSettingValue,
};
