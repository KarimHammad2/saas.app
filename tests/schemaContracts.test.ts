import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf-8");
}

describe("schema and persistence contracts", () => {
  it("requires kickoff completion in reminder eligibility SQL", async () => {
    const sql = await readRepoFile("supabase/migrations/20260327_000007_phase1_sow.sql");
    expect(sql).toMatch(/create or replace function public\.list_projects_for_reminder/i);
    expect(sql).toMatch(/p\.kickoff_completed_at is not null/i);
  });

  it("keeps project version snapshot contract in alignment migration", async () => {
    const sql = await readRepoFile("supabase/migrations/20260327_000008_phase2_alignment.sql");
    expect(sql).toMatch(/create table if not exists public\.project_versions/i);
    expect(sql).toMatch(/snapshot jsonb not null/i);
    expect(sql).toMatch(/idx_project_versions_project_created/i);
  });

  it("keeps explicit dual project-state model references synchronized", async () => {
    const refactorMigration = await readRepoFile("supabase/migrations/20260319_000005_email_memory_refactor.sql");
    const repositoryCode = await readRepoFile("modules/memory/repository.ts");
    const legacyProjectServiceCode = await readRepoFile("src/memory/project.service.ts");

    expect(refactorMigration).toMatch(/create table if not exists public\.project_state/i);
    expect(repositoryCode).toMatch(/from\("project_states"\)/);
    expect(legacyProjectServiceCode).toMatch(/from\("project_state"\)/);
  });

  it("defines RLS deny policies for anon/authenticated on all app tables", async () => {
    const sql = await readRepoFile("supabase/migrations/20260327_000010_rls_policies_public_api_roles.sql");
    expect(sql).toMatch(/deny_anon_and_authenticated_all/i);
    expect(sql).toMatch(/to anon, authenticated/i);
    expect(sql).toMatch(/'users'/);
    expect(sql).toMatch(/'project_versions'/);
    expect(sql).toMatch(/information_schema\.tables/i);
  });

  it("backfills RLS for project_versions when phase 2 ran after the bulk RLS migration", async () => {
    const sql = await readRepoFile("supabase/migrations/20260327_000011_rls_project_versions_if_present.sql");
    expect(sql).toMatch(/project_versions/i);
    expect(sql).toMatch(/deny_anon_and_authenticated_all/i);
  });

  it("configures Supabase-native reminders scheduler via pg_cron and pg_net", async () => {
    const sql = await readRepoFile("supabase/migrations/20260327_000009_supabase_cron_reminders.sql");
    expect(sql).toMatch(/create extension if not exists pg_cron/i);
    expect(sql).toMatch(/create extension if not exists pg_net/i);
    expect(sql).toMatch(/create or replace function public\.configure_reminders_webhook/i);
    expect(sql).toMatch(/create or replace function public\.invoke_reminders_webhook/i);
    expect(sql).toMatch(/extensions\.net\.http_post/i);
    expect(sql).toMatch(/cron\.schedule\(\s*'reminders_daily_utc'/i);
    expect(sql).not.toMatch(/\$\$select\s+public\.invoke_reminders_webhook\(\);\$\$/i);
    expect(sql).toMatch(/'select public\.invoke_reminders_webhook\(\);'/i);
    expect(sql).toMatch(/cron\.reminders\.webhook_url/i);
    expect(sql).toMatch(/cron\.reminders\.secret/i);
  });

  it("removes Vercel cron configuration", async () => {
    await expect(access(path.join(repoRoot, "vercel.json"))).rejects.toBeDefined();
  });

  it("seeds dedicated kickoff email template key", async () => {
    const sql = await readRepoFile("supabase/migrations/20260330_000012_project_kickoff_template.sql");
    expect(sql).toMatch(/project_kickoff/i);
    expect(sql).toMatch(/on conflict \(key\) do update set/i);
  });
});
