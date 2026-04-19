import type { ProjectDomain } from "@/modules/contracts/types";

const PROJECT_DOMAINS: readonly ProjectDomain[] = ["general", "tech_product", "marketing", "sales", "operations"];

export function isProjectDomain(value: string | null | undefined): value is ProjectDomain {
  return value != null && value !== "" && (PROJECT_DOMAINS as readonly string[]).includes(value);
}

export function normalizeProjectDomain(value: string | null | undefined): ProjectDomain {
  if (isProjectDomain(value)) {
    return value;
  }
  return "general";
}

/** DB → app: missing or unknown values become undefined so callers can infer from copy. */
export function parseStoredProjectDomain(value: string | null | undefined): ProjectDomain | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) {
    return undefined;
  }
  return isProjectDomain(v) ? v : undefined;
}

/**
 * Classify inbound kickoff/update text into a small closed set of playbooks.
 * Order matters: more specific domains are checked before broad tech signals.
 */
export function inferProjectDomainFromText(parts: Array<string | null | undefined>): ProjectDomain {
  const text = parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "general";
  }

  if (
    /\b(marketing campaign|outbound campaign|lead generation campaign|go-?to-?market|gtm\b|demand gen|demand generation|content marketing|paid social|paid search|facebook ads|meta ads|google ads|linkedin ads|seo\b|sem\b|newsletter growth|email nurture|brand campaign|social media strategy|influencer|pr launch|press release|ad creative|media buy)\b/.test(
      text,
    ) ||
    /\b(launch (?:a |the )?(?:outbound )?campaign|run ads|ad spend|awareness campaign)\b/.test(text)
  ) {
    return "marketing";
  }

  if (
    /\b(sales funnel|pipeline\b|outbound sales|cold email|cold outreach|prospecting|quota\b|book (?:more )?meetings|discovery calls|deal flow|win rate|sales playbook|sales sequence)\b/.test(
      text,
    )
  ) {
    return "sales";
  }

  if (
    /\b(hiring plan|recruiting|onboarding staff|\bsops?\b|standard operating procedures?|process improvement|internal operations|org design|workflow for the team)\b/.test(
      text,
    )
  ) {
    return "operations";
  }

  if (
    /\b(saas\b|software as a service|\bmvp\b|web app|mobile app|ios app|android app|backend|frontend|full-?stack|api\b|microservices|deploy\b|infrastructure|auth\b|database schema|codebase|engineering|feature flag|technical debt)\b/.test(
      text,
    ) ||
    /\b(build|ship) (?:a |an |the )?(?:product|platform|tool|dashboard)\b/.test(text)
  ) {
    return "tech_product";
  }

  return "general";
}
