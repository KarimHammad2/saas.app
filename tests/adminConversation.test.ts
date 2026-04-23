import { describe, expect, it } from "vitest";
import {
  buildAdminConfirmationReply,
  buildAdminMenuReply,
  parseAdminRequest,
} from "@/modules/orchestration/adminConversation";

describe("parseAdminRequest", () => {
  it("returns menu for 'Admin'", () => {
    expect(parseAdminRequest("Admin")).toEqual({ kind: "menu" });
  });

  it("returns confirm for standalone CONFIRM", () => {
    expect(parseAdminRequest("CONFIRM")).toEqual({ kind: "confirm" });
  });

  it("parses show users", () => {
    expect(parseAdminRequest("Show me all users")).toEqual({ kind: "show_users" });
  });

  it("parses show projects for a user", () => {
    expect(parseAdminRequest("Show projects for john@example.com")).toEqual({
      kind: "show_projects",
      userEmail: "john@example.com",
    });
  });

  it("parses show updates by project name (not id)", () => {
    const request = parseAdminRequest("Show updates for project Alpha Launch");
    expect(request).toEqual({
      kind: "show_updates",
      projectName: "Alpha Launch",
      userEmail: null,
    });
  });

  it("parses show goals for a named project with an owner filter", () => {
    const request = parseAdminRequest("Show goals for project Alpha Launch for john@example.com");
    expect(request).toEqual({
      kind: "show_project_state",
      projectName: "Alpha Launch",
      userEmail: "john@example.com",
      sections: ["goals"],
    });
  });

  it("parses show documents for a project", () => {
    expect(parseAdminRequest("Show documents for project Alpha Launch")).toEqual({
      kind: "show_documents",
      projectName: "Alpha Launch",
      userEmail: null,
    });
  });

  it("parses show settings with key prefix", () => {
    expect(parseAdminRequest("Show settings email.admin_bcc")).toEqual({
      kind: "show_settings",
      keyPrefix: "email.admin_bcc",
    });
  });

  it("parses show template by key", () => {
    expect(parseAdminRequest("Show template project_update")).toEqual({
      kind: "show_templates",
      key: "project_update",
    });
  });

  it("parses show instruction by key", () => {
    expect(parseAdminRequest("Show instruction llm_document_usage")).toEqual({
      kind: "show_instructions",
      key: "llm_document_usage",
    });
  });

  it("parses archive project using the project name (not an id)", () => {
    expect(parseAdminRequest("Archive project Alpha Launch for john@example.com")).toEqual({
      kind: "archive_project",
      projectName: "Alpha Launch",
      userEmail: "john@example.com",
    });
  });

  it("parses restore project using the project name (not an id)", () => {
    expect(parseAdminRequest("Restore project Alpha Launch for john@example.com")).toEqual({
      kind: "restore_project",
      projectName: "Alpha Launch",
      userEmail: "john@example.com",
    });
  });

  it("parses delete project using the project name (not an id)", () => {
    expect(parseAdminRequest("Delete project Alpha Launch for john@example.com")).toEqual({
      kind: "delete_project",
      projectName: "Alpha Launch",
      userEmail: "john@example.com",
    });
  });

  it("parses delete project without an owner when the name is unique", () => {
    expect(parseAdminRequest("Delete project Alpha Launch")).toEqual({
      kind: "delete_project",
      projectName: "Alpha Launch",
      userEmail: null,
    });
  });

  it("parses create user with an email", () => {
    expect(parseAdminRequest("Create user alice@example.com")).toEqual({
      kind: "create_user",
      userEmail: "alice@example.com",
    });
  });

  it("parses create user with no email as missing", () => {
    expect(parseAdminRequest("Create user")).toEqual({
      kind: "create_user",
      userEmail: null,
    });
  });

  it("parses create project with a project name and owner email", () => {
    expect(
      parseAdminRequest("Create project Alpha Launch for alice@example.com"),
    ).toEqual({
      kind: "create_project",
      projectName: "Alpha Launch",
      userEmail: "alice@example.com",
    });
  });

  it("parses edit project field with 'to' value", () => {
    expect(
      parseAdminRequest("Set current status for project Alpha Launch to Design review in progress"),
    ).toEqual({
      kind: "edit_project_field",
      projectName: "Alpha Launch",
      userEmail: null,
      field: "current_status",
      value: "Design review in progress",
    });
  });

  it("parses set instruction", () => {
    expect(parseAdminRequest("Set instruction llm_document_usage to New content here")).toEqual({
      kind: "upsert_instruction",
      key: "llm_document_usage",
      content: "New content here",
    });
  });

  it("parses update template subject", () => {
    expect(parseAdminRequest("Update template project_update subject to New Subject")).toEqual({
      kind: "upsert_email_template",
      key: "project_update",
      field: "subject",
      value: "New Subject",
    });
  });

  it("parses set setting to boolean value", () => {
    expect(parseAdminRequest("Set setting email.admin_bcc.enabled to true")).toEqual({
      kind: "upsert_system_setting",
      key: "email.admin_bcc.enabled",
      rawValue: "true",
    });
  });

  it("parses assign RPM for project by name", () => {
    expect(
      parseAdminRequest("Assign john@example.com to rpm@example.com for project Alpha Launch"),
    ).toEqual({
      kind: "assign_rpm",
      userEmail: "john@example.com",
      rpmEmail: "rpm@example.com",
      projectName: "Alpha Launch",
    });
  });

  it("parses remove RPM for project by name", () => {
    expect(parseAdminRequest("Remove the RPM from john@example.com for project Alpha Launch")).toEqual({
      kind: "remove_rpm",
      userEmail: "john@example.com",
      projectName: "Alpha Launch",
    });
  });

  it("parses make a user an agency", () => {
    expect(parseAdminRequest("Make john@example.com an agency")).toEqual({
      kind: "update_tier",
      userEmail: "john@example.com",
      tier: "agency",
    });
  });

  it("returns null for unrelated text", () => {
    expect(parseAdminRequest("Hi Frank, please review my project")).toBeNull();
  });
});

describe("buildAdminMenuReply", () => {
  it("includes both View and Manage sections in the text body", () => {
    const reply = buildAdminMenuReply("Admin");
    expect(reply.subject).toBe("Re: Admin");
    expect(reply.text).toContain("Admin Menu");
    expect(reply.text).toContain("View (read-only)");
    expect(reply.text).toContain("Manage (requires CONFIRM)");
    expect(reply.text).toContain("Archive a project");
    expect(reply.text).toContain("Update an instruction");
  });

  it("renders an HTML body with grouped sections", () => {
    const reply = buildAdminMenuReply("Admin");
    expect(reply.html).toContain("Admin Menu");
    expect(reply.html).toContain("View (read-only)");
    expect(reply.html).toContain("Manage (requires CONFIRM)");
  });

  it("advertises Delete a project under Manage", () => {
    const reply = buildAdminMenuReply("Admin");
    expect(reply.text).toContain("Delete a project");
    expect(reply.html).toContain("Delete a project");
  });

  it("advertises Create a user and Create a project under Manage", () => {
    const reply = buildAdminMenuReply("Admin");
    expect(reply.text).toContain("Create a user");
    expect(reply.text).toContain("Create a project");
    expect(reply.html).toContain("Create a user");
    expect(reply.html).toContain("Create a project");
  });
});

describe("buildAdminConfirmationReply for delete_project", () => {
  it("warns the action is permanent in both text and html", () => {
    const reply = buildAdminConfirmationReply("Admin", {
      kind: "delete_project",
      projectName: "Alpha Launch",
      userEmail: "john@example.com",
    });
    expect(reply.subject).toBe("Re: Admin");
    expect(reply.text).toContain("Delete project (permanent)");
    expect(reply.text.toLowerCase()).toContain("permanently remove");
    expect(reply.text).toContain("Alpha Launch");
    expect(reply.text).toContain("john@example.com");
    expect(reply.text).toContain('Reply "CONFIRM"');
    expect(reply.html).toContain("Delete project (permanent)");
    expect(reply.html.toLowerCase()).toContain("permanently remove");
    expect(reply.html).toContain("Alpha Launch");
  });

  it("falls back to (first unique match) when no owner is provided", () => {
    const reply = buildAdminConfirmationReply("Admin", {
      kind: "delete_project",
      projectName: "Alpha Launch",
      userEmail: null,
    });
    expect(reply.text).toContain("Owner: (first unique match)");
    expect(reply.html).toContain("(first unique match)");
  });
});

describe("buildAdminConfirmationReply for create_user and create_project", () => {
  it("echoes the user email and default tier for create_user", () => {
    const reply = buildAdminConfirmationReply("Admin", {
      kind: "create_user",
      userEmail: "alice@example.com",
    });
    expect(reply.text).toContain("Create user");
    expect(reply.text).toContain("alice@example.com");
    expect(reply.text).toContain("Tier: Freemium (default)");
    expect(reply.text).toContain('Reply "CONFIRM"');
    expect(reply.html).toContain("Create user");
    expect(reply.html).toContain("alice@example.com");
    expect(reply.html).toContain("Freemium (default)");
  });

  it("echoes the project name and owner email for create_project", () => {
    const reply = buildAdminConfirmationReply("Admin", {
      kind: "create_project",
      projectName: "Alpha Launch",
      userEmail: "alice@example.com",
    });
    expect(reply.text).toContain("Create project");
    expect(reply.text).toContain("Project: Alpha Launch");
    expect(reply.text).toContain("Owner: alice@example.com");
    expect(reply.html).toContain("Create project");
    expect(reply.html).toContain("Alpha Launch");
    expect(reply.html).toContain("alice@example.com");
  });
});
