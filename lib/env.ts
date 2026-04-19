import { tryNormalizeEmailAddress } from "@/modules/email/emailAddress";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseServiceRoleKey(): string {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is using a publishable key. Use the Secret service_role key from Supabase.",
    );
  }

  return key;
}

export function getEmailProviderName(): "resend" | "ses" {
  const provider = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  if (provider !== "resend" && provider !== "ses") {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
  }
  return provider;
}

export function getFallbackEmailProviderName(): "resend" | "ses" | null {
  const raw = (process.env.EMAIL_PROVIDER_FALLBACK ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw !== "resend" && raw !== "ses") {
    throw new Error(`Unsupported EMAIL_PROVIDER_FALLBACK: ${raw}`);
  }
  return raw;
}

export function getMasterUserEmail(): string {
  return (process.env.MASTER_USER_EMAIL ?? "daniel@saassquared.com").trim().toLowerCase();
}

export function getDefaultFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? "Frank <frank@domain.com>";
}

/** Bare address that must appear in inbound To for project workflow (hard-locked by product policy). */
export function getInboundTriggerEmail(): string {
  return "frank@saas2.app";
}

/**
 * Internal senders blocked from triggering inbound workflow (merged with domain aliases).
 * Note: MASTER_USER_EMAIL is intentionally not listed — that address is often the default RPM and must be able to reply to Frank.
 */
export function getInternalInboundSenderBlocklist(): string[] {
  const trigger = getInboundTriggerEmail();
  const domain = trigger.includes("@") ? trigger.split("@")[1]! : "saas2.app";

  const builtIn = new Set<string>([trigger, `message@${domain}`, `contact@${domain}`, `system@${domain}`]);

  const extra = process.env.INTERNAL_INBOUND_SENDERS?.split(",") ?? [];
  for (const raw of extra) {
    const e = raw.trim().toLowerCase();
    if (e) {
      builtIn.add(e);
    }
  }

  return Array.from(builtIn);
}

export function getResendApiKey(): string {
  return requireEnv("RESEND_API_KEY");
}

export function getResendWebhookSecret(): string {
  return requireEnv("RESEND_WEBHOOK_SECRET");
}

export function getSesWebhookSecret(): string {
  return requireEnv("SES_WEBHOOK_SECRET");
}

export function getEnableAdminBcc(): boolean {
  return (process.env.ENABLE_ADMIN_BCC ?? "").trim().toLowerCase() === "true";
}

export function getAdminBccEmail(): string | null {
  const value = process.env.ADMIN_BCC_EMAIL?.trim().toLowerCase();
  return value ? value : null;
}

/** Secret for `/api/cron/*` (Authorization: Bearer …). */
export function getCronSecret(): string {
  return requireEnv("CRON_SECRET");
}

/** Days without inbound activity before a reminder is eligible (default 7). */
export function getReminderIdleDays(): number {
  const raw = process.env.REMINDER_IDLE_DAYS?.trim();
  if (!raw) {
    return 7;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

/** `minimal` = Overview/Goals/Tasks/Risks/Notes only. `full` = Status, decisions, RPM, account, etc. */
export function getProjectDocumentMode(): "minimal" | "full" {
  const raw = (process.env.PROJECT_DOCUMENT_MODE ?? "minimal").trim().toLowerCase();
  return raw === "full" ? "full" : "minimal";
}

/** `frozen` = overview only from kickoff (default). `rules` = regenerate from initial + goals + notes. */
export function getOverviewRegenerationMode(): "frozen" | "rules" {
  const raw = (process.env.OVERVIEW_REGENERATION_MODE ?? "frozen").trim().toLowerCase();
  return raw === "rules" ? "rules" : "frozen";
}

/** When true, inbound `Summary:` / `Overview:` sections may replace stored overview (default false). */
export function getAllowOverviewOverride(): boolean {
  return (process.env.ALLOW_OVERVIEW_OVERRIDE ?? "").trim().toLowerCase() === "true";
}
