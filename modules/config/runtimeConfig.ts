import { getAdminBccEmail, getEnableAdminBcc } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";

interface EmailTemplate {
  subject: string;
  textBody: string;
  htmlBody: string;
}

interface RuntimeConfig {
  adminBccEnabled: boolean;
  adminBccAddress: string | null;
  llmInstruction: string;
  projectUpdateTemplate: EmailTemplate;
  projectWelcomeTemplate: EmailTemplate;
}

const DEFAULT_PROJECT_TEMPLATE: EmailTemplate = {
  subject: "Project Update",
  textBody:
    "{{summary}}\n\nYour project has been updated.\n\nAttached is the latest project memory document.",
  htmlBody:
    "<!doctype html><html><body><p>{{summary}}</p><p>Your project has been updated.</p><p>Attached is the latest project memory document.</p></body></html>",
};

const DEFAULT_PROJECT_WELCOME_TEMPLATE: EmailTemplate = {
  subject: "Welcome to SaaS² — Your Project Started",
  textBody:
    "Welcome to SaaS² — Your Project Started\n\nHi,\n\nYour project has been initialized.\n\nAttached is your project document.\n\nUse this document inside ChatGPT / Gemini.\n\nWhenever you update your project, send an email back here.\n\nBest,\nFrank",
  htmlBody:
    "<!doctype html><html><body><h2>Welcome to SaaS² — Your Project Started</h2><p>Hi,</p><p>Your project has been initialized.</p><p>Attached is your project document.</p><p>Use this document inside ChatGPT / Gemini.</p><p>Whenever you update your project, send an email back here.</p><p>Best,<br/>Frank</p></body></html>",
};

const DEFAULT_INSTRUCTION = "Use the attached project document as authoritative context for your external LLM.";

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function renderTemplate(template: string, tokens: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(tokens)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

export function renderProjectUpdateTemplate(template: EmailTemplate, summary: string, document: string, instruction: string) {
  const values = {
    summary,
    document,
    instruction,
  };
  return {
    subject: renderTemplate(template.subject, values) || DEFAULT_PROJECT_TEMPLATE.subject,
    text: renderTemplate(template.textBody, values),
    html: renderTemplate(template.htmlBody, values),
  };
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const supabase = getSupabaseAdminClient();

  const [settingsResult, projectUpdateTemplateResult, projectWelcomeTemplateResult, instructionResult] = await Promise.all([
    supabase.from("system_settings").select("key, value_json").in("key", ["email.admin_bcc.enabled", "email.admin_bcc.address"]),
    supabase
      .from("email_templates")
      .select("subject, text_body, html_body")
      .eq("key", "project_update")
      .maybeSingle<{ subject: string; text_body: string; html_body: string }>(),
    supabase
      .from("email_templates")
      .select("subject, text_body, html_body")
      .eq("key", "project_welcome")
      .maybeSingle<{ subject: string; text_body: string; html_body: string }>(),
    supabase.from("instructions").select("content").eq("key", "llm_document_usage").maybeSingle<{ content: string }>(),
  ]);

  const settingRows = settingsResult.error ? [] : settingsResult.data ?? [];
  const enabledRow = settingRows.find((row) => row.key === "email.admin_bcc.enabled");
  const addressRow = settingRows.find((row) => row.key === "email.admin_bcc.address");

  const enabledJson = asObject(enabledRow?.value_json);
  const addressJson = asObject(addressRow?.value_json);

  const adminBccEnabled = asBoolean(enabledJson.enabled) || getEnableAdminBcc();
  const dbAddress = asString(addressJson.address).toLowerCase();
  const adminBccAddress = dbAddress || getAdminBccEmail();

  const projectUpdateTemplate = projectUpdateTemplateResult.error || !projectUpdateTemplateResult.data
    ? DEFAULT_PROJECT_TEMPLATE
    : {
        subject: projectUpdateTemplateResult.data.subject || DEFAULT_PROJECT_TEMPLATE.subject,
        textBody: projectUpdateTemplateResult.data.text_body || DEFAULT_PROJECT_TEMPLATE.textBody,
        htmlBody: projectUpdateTemplateResult.data.html_body || DEFAULT_PROJECT_TEMPLATE.htmlBody,
      };

  const llmInstruction = instructionResult.error ? DEFAULT_INSTRUCTION : instructionResult.data?.content?.trim() || DEFAULT_INSTRUCTION;

  const projectWelcomeTemplate =
    projectWelcomeTemplateResult.error || !projectWelcomeTemplateResult.data
      ? DEFAULT_PROJECT_WELCOME_TEMPLATE
      : {
          subject: projectWelcomeTemplateResult.data.subject || DEFAULT_PROJECT_WELCOME_TEMPLATE.subject,
          textBody: projectWelcomeTemplateResult.data.text_body || DEFAULT_PROJECT_WELCOME_TEMPLATE.textBody,
          htmlBody: projectWelcomeTemplateResult.data.html_body || DEFAULT_PROJECT_WELCOME_TEMPLATE.htmlBody,
        };

  return {
    adminBccEnabled,
    adminBccAddress,
    llmInstruction,
    projectUpdateTemplate: projectUpdateTemplate,
    projectWelcomeTemplate,
  };
}
