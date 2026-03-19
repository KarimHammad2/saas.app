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

export function getEmailProviderName(): string {
  const provider = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  if (provider !== "resend" && provider !== "ses") {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
  }
  return provider;
}

export function getMasterUserEmail(): string {
  return (process.env.MASTER_USER_EMAIL ?? "daniel@saas2.app").trim().toLowerCase();
}

export function getDefaultFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? "Frank <frank@domain.com>";
}

export function getResendApiKey(): string {
  return requireEnv("RESEND_API_KEY");
}

export function getResendWebhookSecret(): string {
  return requireEnv("RESEND_WEBHOOK_SECRET");
}
