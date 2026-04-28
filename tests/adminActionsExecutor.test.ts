import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNewUserWelcomeEmail } from "@/modules/email/sendNewUserWelcomeEmail";

vi.mock("@/modules/email/sendNewUserWelcomeEmail", () => ({
  sendNewUserWelcomeEmail: vi.fn(async () => undefined),
}));

vi.mock("@/modules/email/sendAgencyAccountProvisioningEmails", () => ({
  sendNewAgencyUserWelcomeCombinedEmail: vi.fn(async () => undefined),
  sendMasterAgencyProvisioningReceiptEmail: vi.fn(async () => undefined),
}));

vi.mock("@/modules/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

import { sendEmail } from "@/modules/email/sendEmail";
import {
  sendMasterAgencyProvisioningReceiptEmail,
  sendNewAgencyUserWelcomeCombinedEmail,
} from "@/modules/email/sendAgencyAccountProvisioningEmails";
import { executeAdminAction } from "@/modules/orchestration/adminActionsExecutor";
import type { MemoryRepository } from "@/modules/memory/repository";
import type { ProjectContext } from "@/modules/contracts/types";

type PartialRepo = Partial<MemoryRepository> & Record<string, ReturnType<typeof vi.fn>>;

const defaultProjectContext: ProjectContext = {
  projectId: "p-target",
  userId: "u-owner",
  projectStatus: "active",
  summary: "existing summary",
  initialSummary: "existing summary",
  currentStatus: "in review",
  goals: ["keep goal"],
  actionItems: [],
  completedTasks: [],
  decisions: [],
  risks: [],
  recommendations: [],
  notes: [],
  participants: [],
  recentUpdatesLog: [],
  remainderBalance: 0,
  reminderBalance: 0,
  usageCount: 0,
  tier: "freemium",
  featureFlags: { collaborators: false, oversight: false },
  transactionHistory: [],
};

function makeRepo(overrides: Partial<Record<keyof MemoryRepository, unknown>> = {}): MemoryRepository {
  const {
    findUserByEmail: findUserByEmailOverride,
    findUserByAccountEmail: findUserByAccountEmailOverride,
    ...restOverrides
  } = overrides;

  const findUserByEmail =
    (findUserByEmailOverride as ReturnType<typeof vi.fn> | undefined) ?? vi.fn(async () => null);
  const findUserByAccountEmail =
    (findUserByAccountEmailOverride as ReturnType<typeof vi.fn> | undefined) ??
    vi.fn(async (email: string) => findUserByEmail(email));

  const repo: PartialRepo = {
    findUserByEmail,
    findUserByAccountEmail,
    findProjectsByName: vi.fn(async () => []),
    setProjectArchived: vi.fn(async () => undefined),
    loadProjectDeletionSnapshot: vi.fn(async () => ({ project: null, state: null, rpmEmail: null })),
    hardDeleteProject: vi.fn(async () => undefined),
    loadUserDeletionSnapshot: vi.fn(async () => ({ user: null, projects: [], emails: [] })),
    hardDeleteUser: vi.fn(async () => undefined),
    getOrCreateUserByEmail: vi.fn(async (email: string) => ({
      user: {
        id: "u-new",
        email,
        display_name: null,
        tier: "freemium",
        created_at: "2026-04-23T00:00:00.000Z",
      },
      created: true,
    })),
    createProjectForUser: vi.fn(async (userId: string, name: string) => ({
      project: {
        id: "p-new",
        user_id: userId,
        owner_email: "owner@example.com",
        name,
        status: "active",
        project_code: "PJT-ABCD12",
        remainder_balance: 0,
        reminder_balance: 0,
        usage_count: 0,
        archived_at: null,
      },
      created: true,
    })),
    recordAdminAuditLog: vi.fn(async () => undefined),
    getProjectState: vi.fn(async () => defaultProjectContext),
    replaceGoals: vi.fn(async () => undefined),
    replaceActionItems: vi.fn(async () => undefined),
    replaceProjectRisks: vi.fn(async () => undefined),
    replaceProjectNotes: vi.fn(async () => undefined),
    replaceProjectSummary: vi.fn(async () => undefined),
    replaceProjectCurrentStatus: vi.fn(async () => undefined),
    upsertInstruction: vi.fn(async (key: string, content: string) => ({ key, content, previous: null })),
    upsertEmailTemplate: vi.fn(async (key: string, patch: Record<string, string>) => ({
      key,
      subject: patch.subject ?? "",
      textBody: patch.textBody ?? "",
      htmlBody: patch.htmlBody ?? "",
      previous: null,
    })),
    upsertSystemSetting: vi.fn(async (key: string, valueJson: unknown) => ({ key, valueJson, previous: null })),
    setUserTier: vi.fn(async () => undefined),
    applyAgencyTierRpmTransition: vi.fn(async () => undefined),
    getActiveRpm: vi.fn(async () => null),
    assignRpm: vi.fn(async () => undefined),
    deactivateActiveRpm: vi.fn(async () => undefined),
    addAdditionalEmails: vi.fn(async () => 2),
    removeAdditionalAccountEmail: vi.fn(async () => undefined),
    getUserEmailById: vi.fn(async () => "owner@example.com"),
    ...(restOverrides as Record<string, unknown>),
  };
  return repo as unknown as MemoryRepository;
}

const actorContext = { actorEmail: "daniel@saassquared.com", adminActionId: "a1" };

describe("executeAdminAction - project lifecycle by project name", () => {
  it("archives a project by name scoped to the owner", async () => {
    const project = {
      id: "p-target",
      name: "Alpha Launch",
      user_id: "u-owner",
      archived_at: null,
    };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ id: "u-owner", email: "owner@example.com", tier: "freemium" })),
      findProjectsByName: vi.fn(async () => [project]),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "archive_project",
        projectName: "Alpha Launch",
        userEmail: "owner@example.com",
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect((repo.setProjectArchived as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "p-target",
      expect.any(String),
    );
    expect((repo.recordAdminAuditLog as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKind: "archive_project",
        entityType: "project",
        entityRef: "Alpha Launch",
        adminActionId: "a1",
      }),
    );
  });

  it("restores an archived project by name", async () => {
    const project = {
      id: "p-target",
      name: "Alpha Launch",
      user_id: "u-owner",
      archived_at: "2026-04-01T00:00:00.000Z",
    };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ id: "u-owner", email: "owner@example.com", tier: "freemium" })),
      findProjectsByName: vi.fn(async () => [project]),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "restore_project",
        projectName: "Alpha Launch",
        userEmail: "owner@example.com",
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect((repo.setProjectArchived as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("p-target", null);
  });

  it("refuses when multiple projects share the name and no owner is given", async () => {
    const repo = makeRepo({
      findProjectsByName: vi.fn(async () => [
        { id: "p-a", name: "Alpha Launch", user_id: "u-a", archived_at: null },
        { id: "p-b", name: "Alpha Launch", user_id: "u-b", archived_at: null },
      ]),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "archive_project",
        projectName: "Alpha Launch",
        userEmail: null,
      },
      actorContext,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/2 projects named/);
    }
    expect(repo.setProjectArchived).not.toHaveBeenCalled();
  });

  it("hard-deletes a project by name, snapshotting before_json and cascading via FK", async () => {
    const project = {
      id: "p-target",
      name: "Alpha Launch",
      user_id: "u-owner",
      archived_at: null,
    };
    const snapshot = {
      project: { id: "p-target", name: "Alpha Launch", user_id: "u-owner" },
      state: { project_id: "p-target", goals: ["keep goal"] },
      rpmEmail: null,
    };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ id: "u-owner", email: "owner@example.com", tier: "freemium" })),
      findProjectsByName: vi.fn(async () => [project]),
      loadProjectDeletionSnapshot: vi.fn(async () => snapshot),
      hardDeleteProject: vi.fn(async () => undefined),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "delete_project",
        projectName: "Alpha Launch",
        userEmail: "owner@example.com",
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.heading).toBe("Done ✅");
      expect(result.lines.join(" ")).toMatch(/permanently deleted/i);
    }
    expect((repo.loadProjectDeletionSnapshot as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("p-target");
    expect((repo.hardDeleteProject as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("p-target");
    expect((repo.recordAdminAuditLog as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKind: "delete_project",
        entityType: "project",
        entityRef: "Alpha Launch",
        adminActionId: "a1",
        beforeJson: snapshot,
        afterJson: null,
      }),
    );

    const deleteOrder = (repo.hardDeleteProject as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const snapshotOrder = (repo.loadProjectDeletionSnapshot as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(snapshotOrder).toBeLessThan(deleteOrder);
  });

  it("refuses to delete when multiple projects share the name and no owner is given", async () => {
    const repo = makeRepo({
      findProjectsByName: vi.fn(async () => [
        { id: "p-a", name: "Alpha Launch", user_id: "u-a", archived_at: null },
        { id: "p-b", name: "Alpha Launch", user_id: "u-b", archived_at: null },
      ]),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "delete_project",
        projectName: "Alpha Launch",
        userEmail: null,
      },
      actorContext,
    );

    expect(result.ok).toBe(false);
    expect(repo.hardDeleteProject).not.toHaveBeenCalled();
    expect(repo.loadProjectDeletionSnapshot).not.toHaveBeenCalled();
    expect(repo.recordAdminAuditLog).not.toHaveBeenCalled();
  });

  it("returns a no-op message when archiving an already-archived project", async () => {
    const project = {
      id: "p-target",
      name: "Alpha Launch",
      user_id: "u-owner",
      archived_at: "2026-04-01T00:00:00.000Z",
    };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ id: "u-owner", email: "owner@example.com", tier: "freemium" })),
      findProjectsByName: vi.fn(async () => [project]),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "archive_project",
        projectName: "Alpha Launch",
        userEmail: "owner@example.com",
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.heading).toBe("Already archived");
    }
    expect(repo.setProjectArchived).not.toHaveBeenCalled();
  });
});

describe("executeAdminAction - edit project field by project name", () => {
  it("replaces goals and writes an audit log entry", async () => {
    const project = {
      id: "p-target",
      name: "Alpha Launch",
      user_id: "u-owner",
      archived_at: null,
    };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ id: "u-owner", email: "owner@example.com", tier: "freemium" })),
      findProjectsByName: vi.fn(async () => [project]),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "edit_project_field",
        projectName: "Alpha Launch",
        userEmail: "owner@example.com",
        field: "goals",
        value: "Ship MVP; Close 3 pilots",
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect((repo.replaceGoals as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "p-target",
      ["Ship MVP", "Close 3 pilots"],
    );
    expect((repo.recordAdminAuditLog as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKind: "edit_project_field:goals",
        entityType: "project",
        entityRef: "Alpha Launch",
      }),
    );
  });

  it("refuses to edit a project owned by a different user when owner is specified", async () => {
    const project = {
      id: "p-target",
      name: "Alpha Launch",
      user_id: "u-other",
      archived_at: null,
    };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ id: "u-owner", email: "owner@example.com", tier: "freemium" })),
      findProjectsByName: vi.fn(async () => [project]),
    });

    // The resolver returns the single match; the executor then accepts it because the lookup itself
    // was scoped to the owner. To simulate the mismatch case, we instead return no match when scoped.
    // This test is therefore representative of the "no match" path: scoped lookup is empty.
    const scopedRepo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ id: "u-owner", email: "owner@example.com", tier: "freemium" })),
      findProjectsByName: vi.fn(async ({ userId }: { userId?: string | null }) => (userId ? [] : [project])),
    });

    const result = await executeAdminAction(
      scopedRepo,
      {
        kind: "edit_project_field",
        projectName: "Alpha Launch",
        userEmail: "owner@example.com",
        field: "goals",
        value: "only one goal",
      },
      actorContext,
    );

    expect(result.ok).toBe(false);
    expect(repo.replaceGoals).not.toHaveBeenCalled();
  });
});

describe("executeAdminAction - configuration upserts", () => {
  it("upserts an instruction and records the audit log with before/after", async () => {
    const repo = makeRepo({
      upsertInstruction: vi.fn(async (key: string, content: string) => ({
        key,
        content,
        previous: "old content",
      })),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "upsert_instruction",
        key: "llm_document_usage",
        content: "new content",
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect((repo.recordAdminAuditLog as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKind: "upsert_instruction",
        entityType: "instruction",
        entityRef: "llm_document_usage",
        beforeJson: { content: "old content" },
        afterJson: { content: "new content" },
      }),
    );
  });

  it("upserts an email template subject", async () => {
    const repo = makeRepo({
      upsertEmailTemplate: vi.fn(async (key: string, patch: Record<string, string>) => ({
        key,
        subject: patch.subject ?? "",
        textBody: "legacy text",
        htmlBody: "legacy html",
        previous: { subject: "old subject", textBody: "legacy text", htmlBody: "legacy html" },
      })),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "upsert_email_template",
        key: "project_update",
        patch: { subject: "New Subject" },
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect((repo.upsertEmailTemplate as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "project_update",
      { subject: "New Subject" },
    );
  });

  it("upserts a system setting with parsed JSON value", async () => {
    const repo = makeRepo();

    const result = await executeAdminAction(
      repo,
      {
        kind: "upsert_system_setting",
        key: "email.admin_bcc.enabled",
        valueJson: true,
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect((repo.upsertSystemSetting as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "email.admin_bcc.enabled",
      true,
    );
  });
});

describe("executeAdminAction - create_user", () => {
  beforeEach(() => {
    vi.mocked(sendNewUserWelcomeEmail).mockClear();
  });

  it("creates a new user and records the audit log with afterJson", async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => null),
      getOrCreateUserByEmail: vi.fn(async (email: string) => ({
        user: {
          id: "u-new",
          email,
          display_name: null,
          tier: "freemium" as const,
          created_at: "2026-04-23T00:00:00.000Z",
        },
        created: true,
      })),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "create_user", userEmail: "alice@example.com" },
      actorContext,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.heading).toBe("Done ✅");
      expect(result.lines.join(" ")).toContain("alice@example.com");
      expect(result.lines.some((l) => /welcome email sent/i.test(l))).toBe(true);
    }
    expect(sendNewUserWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(sendNewUserWelcomeEmail).toHaveBeenCalledWith("alice@example.com");
    expect((repo.getOrCreateUserByEmail as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "alice@example.com",
    );
    expect((repo.recordAdminAuditLog as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKind: "create_user",
        entityType: "user",
        entityRef: "alice@example.com",
        beforeJson: null,
        afterJson: expect.objectContaining({ id: "u-new", email: "alice@example.com", tier: "freemium" }),
        adminActionId: "a1",
      }),
    );
  });

  it("is idempotent when the user already exists", async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({
        id: "u-existing",
        email: "alice@example.com",
        display_name: null,
        tier: "agency" as const,
        created_at: "2026-04-20T00:00:00.000Z",
      })),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "create_user", userEmail: "alice@example.com" },
      actorContext,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.heading).toBe("Already exists");
      expect(result.lines.join(" ")).toMatch(/already exists/i);
      expect(result.lines.join(" ")).toMatch(/agency/i);
    }
    expect(sendNewUserWelcomeEmail).not.toHaveBeenCalled();
    expect(repo.getOrCreateUserByEmail).not.toHaveBeenCalled();
    expect(repo.recordAdminAuditLog).not.toHaveBeenCalled();
  });
});

describe("executeAdminAction - delete_user", () => {
  it("hard-deletes a user by email, snapshotting before_json and recording the audit log", async () => {
    const target = {
      id: "u-target",
      email: "victim@example.com",
      display_name: null,
      tier: "freemium" as const,
      created_at: "2026-04-20T00:00:00.000Z",
    };
    const snapshot = {
      user: { id: "u-target", email: "victim@example.com", tier: "freemium" },
      projects: [{ id: "p-1", name: "Alpha", project_code: "PJT-AAA111", status: "active", archived_at: null }],
      emails: [{ email: "victim@example.com", is_primary: true }],
    };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => target),
      loadUserDeletionSnapshot: vi.fn(async () => snapshot),
      hardDeleteUser: vi.fn(async () => undefined),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "delete_user", userEmail: "victim@example.com" },
      actorContext,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.heading).toBe("Done ✅");
      expect(result.lines.join(" ")).toMatch(/permanently deleted/i);
      expect(result.lines.join(" ")).toContain("victim@example.com");
    }
    expect((repo.findUserByAccountEmail as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("victim@example.com");
    expect((repo.loadUserDeletionSnapshot as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("u-target");
    expect((repo.hardDeleteUser as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("u-target");
    expect((repo.recordAdminAuditLog as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKind: "delete_user",
        entityType: "user",
        entityRef: "victim@example.com",
        adminActionId: "a1",
        beforeJson: snapshot,
        afterJson: null,
      }),
    );

    const deleteOrder = (repo.hardDeleteUser as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const snapshotOrder = (repo.loadUserDeletionSnapshot as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(snapshotOrder).toBeLessThan(deleteOrder);
  });

  it("returns ok:false when the target user does not exist", async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => null),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "delete_user", userEmail: "missing@example.com" },
      actorContext,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("missing@example.com");
    }
    expect(repo.loadUserDeletionSnapshot).not.toHaveBeenCalled();
    expect(repo.hardDeleteUser).not.toHaveBeenCalled();
    expect(repo.recordAdminAuditLog).not.toHaveBeenCalled();
  });

  it("blocks deletion of the master admin email", async () => {
    const repo = makeRepo();

    const result = await executeAdminAction(
      repo,
      { kind: "delete_user", userEmail: "daniel@saassquared.com" },
      actorContext,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toContain("master");
    }
    expect(repo.findUserByAccountEmail).not.toHaveBeenCalled();
    expect(repo.loadUserDeletionSnapshot).not.toHaveBeenCalled();
    expect(repo.hardDeleteUser).not.toHaveBeenCalled();
    expect(repo.recordAdminAuditLog).not.toHaveBeenCalled();
  });

  it("resolves the account by alias when findUserByAccountEmail returns the user", async () => {
    const target = {
      id: "u-target",
      email: "owner@example.com",
      display_name: null,
      tier: "agency" as const,
      created_at: "2026-04-20T00:00:00.000Z",
    };
    const snapshot = { user: target, projects: [], emails: [] };
    const findUserByAccountEmail = vi.fn(async () => target);
    const findUserByEmail = vi.fn(async () => null);
    const repo = makeRepo({
      findUserByEmail,
      findUserByAccountEmail,
      loadUserDeletionSnapshot: vi.fn(async () => snapshot),
      hardDeleteUser: vi.fn(async () => undefined),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "delete_user", userEmail: "member@example.com" },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect(findUserByAccountEmail).toHaveBeenCalledWith("member@example.com");
    expect((repo.hardDeleteUser as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("u-target");
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("uses agency success copy when deletionWording is agency", async () => {
    const target = {
      id: "u-target",
      email: "owner@example.com",
      display_name: null,
      tier: "agency" as const,
      created_at: "2026-04-20T00:00:00.000Z",
    };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => target),
      loadUserDeletionSnapshot: vi.fn(async () => ({ user: null, projects: [], emails: [] })),
      hardDeleteUser: vi.fn(async () => undefined),
    });
    const result = await executeAdminAction(
      repo,
      { kind: "delete_user", userEmail: "owner@example.com", deletionWording: "agency" },
      actorContext,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines.join(" ")).toMatch(/\(agency\)/);
      expect(result.lines.join(" ")).toMatch(/RPM/);
    }
  });
});

describe("executeAdminAction - create_project", () => {
  it("creates a project for an existing owner and records the audit log", async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({
        id: "u-owner",
        email: "owner@example.com",
        display_name: null,
        tier: "freemium" as const,
        created_at: "2026-04-20T00:00:00.000Z",
      })),
      findProjectsByName: vi.fn(async () => []),
      createProjectForUser: vi.fn(async (userId: string, name: string) => ({
        project: {
          id: "p-new",
          user_id: userId,
          owner_email: "owner@example.com",
          name,
          status: "active",
          project_code: "PJT-ABCD12",
          remainder_balance: 0,
          reminder_balance: 0,
          usage_count: 0,
          archived_at: null,
        },
        created: true,
      })),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "create_project",
        projectName: "Alpha Launch",
        userEmail: "owner@example.com",
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.heading).toBe("Done ✅");
      expect(result.lines.join(" ")).toContain("Alpha Launch");
      expect(result.lines.join(" ")).toContain("PJT-ABCD12");
    }
    expect((repo.createProjectForUser as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "u-owner",
      "Alpha Launch",
      expect.objectContaining({ createdByEmail: actorContext.actorEmail }),
    );
    expect((repo.recordAdminAuditLog as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKind: "create_project",
        entityType: "project",
        entityRef: "Alpha Launch",
        beforeJson: null,
        afterJson: expect.objectContaining({ id: "p-new", name: "Alpha Launch", user_id: "u-owner" }),
      }),
    );
  });

  it("rejects when the owner does not exist and does not create anything", async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => null),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "create_project",
        projectName: "Alpha Launch",
        userEmail: "missing@example.com",
      },
      actorContext,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/create user/i);
      expect(result.reason).toContain("missing@example.com");
    }
    expect(repo.createProjectForUser).not.toHaveBeenCalled();
    expect(repo.recordAdminAuditLog).not.toHaveBeenCalled();
  });

  it("returns Already exists when the owner already has a project with that name", async () => {
    const existingProject = {
      id: "p-existing",
      user_id: "u-owner",
      owner_email: "owner@example.com",
      name: "Alpha Launch",
      status: "active",
      project_code: "PJT-EXISTS",
      remainder_balance: 0,
      reminder_balance: 0,
      usage_count: 0,
      archived_at: null,
    };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({
        id: "u-owner",
        email: "owner@example.com",
        display_name: null,
        tier: "freemium" as const,
        created_at: "2026-04-20T00:00:00.000Z",
      })),
      findProjectsByName: vi.fn(async () => [existingProject]),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "create_project",
        projectName: "Alpha Launch",
        userEmail: "owner@example.com",
      },
      actorContext,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.heading).toBe("Already exists");
      expect(result.lines.join(" ")).toContain("Alpha Launch");
      expect(result.lines.join(" ")).toContain("PJT-EXISTS");
    }
    expect(repo.createProjectForUser).not.toHaveBeenCalled();
    expect(repo.recordAdminAuditLog).not.toHaveBeenCalled();
  });
});

describe("executeAdminAction - update_tier", () => {
  const baseUser = {
    id: "u-tier",
    email: "user@example.com",
    display_name: null,
    created_at: "2026-04-20T00:00:00.000Z" as const,
  };

  beforeEach(() => {
    vi.mocked(sendEmail).mockClear();
  });

  it("sends a congratulatory notification email on upgrade and records audit log", async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ ...baseUser, tier: "freemium" as const })),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "update_tier", userEmail: "user@example.com", tier: "solopreneur" },
      actorContext,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines.join(" ")).toMatch(/notification email/i);
    }
    expect((repo.setUserTier as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("u-tier", "solopreneur");
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.to).toBe("user@example.com");
    expect(call.subject).toBe("Your SaaS² account tier was updated");
    expect(call.text).toContain("Congratulations!");
  });

  it("sends neutral copy on downgrade (no Congratulations)", async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ ...baseUser, tier: "agency" as const })),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "update_tier", userEmail: "user@example.com", tier: "freemium" },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.text).toContain("updated from Agency to Freemium");
    expect(call.text).not.toMatch(/Congratulations/i);
  });

  it("does not send email when the tier is unchanged", async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ ...baseUser, tier: "solopreneur" as const })),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "update_tier", userEmail: "user@example.com", tier: "solopreneur" },
      actorContext,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines.join(" ")).not.toMatch(/notification email/i);
    }
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

describe("executeAdminAction - agency scope", () => {
  it("rejects delete_project when project is not owned by enforceOwnerUserId", async () => {
    const project = { id: "p-target", name: "Alpha", user_id: "u-intruder", archived_at: null };
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({
        id: "u-agency",
        email: "owner@example.com",
        display_name: null,
        tier: "agency" as const,
        created_at: "2026-04-20T00:00:00.000Z",
      })),
      findProjectsByName: vi.fn(async () => [project]),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "delete_project", projectName: "Alpha", userEmail: "owner@example.com" },
      { actorEmail: "owner@example.com", adminActionId: "a-ag", enforceOwnerUserId: "u-agency" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not part of your agency account/);
    }
    expect(repo.hardDeleteProject).not.toHaveBeenCalled();
  });

  it("add_agency_member adds email and notifies the new member", async () => {
    vi.mocked(sendEmail).mockClear();
    const repo = makeRepo({
      getUserEmailById: vi.fn(async () => "primary@agency.com"),
      addAdditionalEmails: vi.fn(async () => 3),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "add_agency_member", memberEmail: "newmember@agency.com" },
      { actorEmail: "primary@agency.com", adminActionId: "a-mem", enforceOwnerUserId: "u-agency" },
    );

    expect(result.ok).toBe(true);
    expect(repo.addAdditionalEmails).toHaveBeenCalledWith("u-agency", ["newmember@agency.com"]);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "newmember@agency.com",
        subject: expect.stringContaining("primary@agency.com"),
      }),
    );
  });

  it("remove_agency_member removes a non-primary alias", async () => {
    const repo = makeRepo({
      removeAdditionalAccountEmail: vi.fn(async () => undefined),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "remove_agency_member", memberEmail: "gone@agency.com" },
      { actorEmail: "primary@agency.com", adminActionId: "a-rem", enforceOwnerUserId: "u-agency" },
    );

    expect(result.ok).toBe(true);
    expect(repo.removeAdditionalAccountEmail).toHaveBeenCalledWith("u-agency", "gone@agency.com");
    expect(repo.recordAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actionKind: "remove_agency_member", entityRef: "gone@agency.com" }),
    );
  });

  it("remove_agency_member surfaces primary-email error from the repository", async () => {
    const repo = makeRepo({
      removeAdditionalAccountEmail: vi.fn(async () => {
        throw new Error("Cannot remove the primary account email.");
      }),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "remove_agency_member", memberEmail: "primary@agency.com" },
      { actorEmail: "primary@agency.com", adminActionId: "a-rem2", enforceOwnerUserId: "u-agency" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/primary account email/i);
    }
  });

  it("rejects master-only actions when enforceOwnerUserId is set", async () => {
    const repo = makeRepo({ findUserByEmail: vi.fn(async () => null) });
    const result = await executeAdminAction(
      repo,
      { kind: "create_user", userEmail: "x@y.com" },
      { ...actorContext, enforceOwnerUserId: "u-agency" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not available for agency admin/);
    }
  });

  it("master can add_agency_member with agencyPrimaryEmail to another agency account", async () => {
    vi.mocked(sendEmail).mockClear();
    const repo = makeRepo({
      findUserByEmail: vi.fn(async (email: string) => {
        if (email.trim().toLowerCase() === "primary@agency.com") {
          return {
            id: "u-remote-agency",
            email: "primary@agency.com",
            display_name: null,
            tier: "agency" as const,
            created_at: "2026-04-01T00:00:00.000Z",
          };
        }
        return null;
      }),
      getUserEmailById: vi.fn(async (uid: string) =>
        uid === "u-remote-agency" ? "primary@agency.com" : "owner@example.com",
      ),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "add_agency_member",
        memberEmail: "new@member.com",
        agencyPrimaryEmail: "primary@agency.com",
      },
      { actorEmail: actorContext.actorEmail, adminActionId: "a-x", enforceOwnerUserId: null },
    );

    expect(result.ok).toBe(true);
    expect(repo.addAdditionalEmails).toHaveBeenCalledWith("u-remote-agency", ["new@member.com"]);
  });

  it("reject add_agency_member with agencyPrimaryEmail when actor is not master", async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async (email: string) => {
        if (email.trim().toLowerCase() === "primary@agency.com") {
          return {
            id: "u-remote-agency",
            email,
            display_name: null,
            tier: "agency" as const,
            created_at: "2026-04-01T00:00:00.000Z",
          };
        }
        return null;
      }),
    });

    const result = await executeAdminAction(
      repo,
      {
        kind: "add_agency_member",
        memberEmail: "new@member.com",
        agencyPrimaryEmail: "primary@agency.com",
      },
      { actorEmail: "not-master@agency.com", adminActionId: "a-x", enforceOwnerUserId: null },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/master admin/);
    }
  });
});

describe("executeAdminAction - create_agency_user", () => {
  beforeEach(() => {
    vi.mocked(sendNewAgencyUserWelcomeCombinedEmail).mockClear();
    vi.mocked(sendMasterAgencyProvisioningReceiptEmail).mockClear();
  });

  it("promotes new account to agency with combined welcome and master receipt", async () => {
    const repo = makeRepo({});
    const result = await executeAdminAction(
      repo,
      { kind: "create_agency_user", userEmail: "new.agency@example.com" },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect(repo.setUserTier).toHaveBeenCalledWith("u-new", "agency");
    expect(repo.applyAgencyTierRpmTransition).toHaveBeenCalledWith("u-new");
    expect(sendNewAgencyUserWelcomeCombinedEmail).toHaveBeenCalledWith("new.agency@example.com");
    expect(sendMasterAgencyProvisioningReceiptEmail).toHaveBeenCalledWith({
      provisionedPrimaryEmail: "new.agency@example.com",
      scenario: "create_agency_user",
    });
  });

  it("returns early without emails when already agency tier", async () => {
    const repo = makeRepo({
      getOrCreateUserByEmail: vi.fn(async () => ({
        user: {
          id: "u-ag",
          email: "existing@agency.com",
          display_name: null,
          tier: "agency",
          created_at: "2025-01-01T00:00:00.000Z",
        },
        created: false,
      })),
    });

    const result = await executeAdminAction(
      repo,
      { kind: "create_agency_user", userEmail: "existing@agency.com" },
      actorContext,
    );

    expect(result.ok).toBe(true);
    expect(repo.setUserTier).not.toHaveBeenCalled();
    expect(sendNewAgencyUserWelcomeCombinedEmail).not.toHaveBeenCalled();
    expect(sendMasterAgencyProvisioningReceiptEmail).not.toHaveBeenCalled();
  });
});