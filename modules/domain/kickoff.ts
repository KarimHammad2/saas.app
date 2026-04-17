import type { NormalizedEmailEvent, ProjectDomain } from "@/modules/contracts/types";
import { extractKickoffSeed } from "@/modules/domain/kickoffSeed";
import { inferProjectDomainFromText } from "@/modules/domain/projectDomain";
import { cleanOverviewText } from "@/modules/domain/overviewCleaning";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

export interface KickoffSummary {
  summary: string;
  goals: string[];
  actionItems: string[];
  initialNotes: string[];
  constraints: string[];
  nextSteps: string[];
  projectDomain: ProjectDomain;
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeLine(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function extractKickoffFacts(text: string): string[] {
  const normalized = normalizeLine(text);
  const lowered = normalized.toLowerCase();
  const facts: string[] = [];

  const saasForIndustry = lowered.match(/\bsaas\s+(?:for|to)\s+([a-z][a-z0-9\s-]{2,40})\b/i);
  if (saasForIndustry?.[1]) {
    facts.push(`You want to build a SaaS for ${saasForIndustry[1].trim().replace(/[.!,;:]$/, "")}.`);
  } else if (/\bsaas\b/i.test(normalized)) {
    facts.push("You are building a SaaS product.");
  }

  const targetUsers = lowered.match(/\bfor\s+([a-z][a-z0-9\s-]{2,40})\b/i);
  if (targetUsers?.[1]) {
    facts.push(`Your target users may be ${targetUsers[1].trim().replace(/[.!,;:]$/, "")}.`);
  }

  if (/\bmvp\b/i.test(normalized)) {
    facts.push("You want to start with an MVP approach.");
  }

  if (/\b(?:timeline|deadline|launch)\b/i.test(normalized)) {
    facts.push("Timeline is already on your mind, which is great for planning.");
  }

  if (/\b(?:restaurant|restaurants|cafe|cafes|bistro|qsr|food truck)\b/i.test(lowered)) {
    facts.push("Your SaaS appears focused on restaurant operations.");
  }
  if (/\b(?:reservation|booking|table)\b/i.test(lowered)) {
    facts.push("Reservation and table flow may be a core user journey.");
  }
  if (/\b(?:order|ordering|delivery|takeaway|pickup)\b/i.test(lowered)) {
    facts.push("Ordering and delivery flow may be part of your MVP.");
  }
  if (/\b(?:crm|loyalty|retention|membership)\b/i.test(lowered)) {
    facts.push("Customer retention features could differentiate your product.");
  }

  return dedupe(facts);
}

type RestaurantSegment = "small_restaurants" | "chains" | "cloud_kitchens" | "generic";

function detectRestaurantSegment(summary: string): RestaurantSegment {
  const lowered = summary.toLowerCase();
  if (/\b(?:cloud kitchen|ghost kitchen|dark kitchen|delivery[- ]only)\b/.test(lowered)) {
    return "cloud_kitchens";
  }
  if (/\b(?:chain|franchise|multi[- ]location|multiple locations)\b/.test(lowered)) {
    return "chains";
  }
  if (/\b(?:restaurant|restaurants|cafe|cafes|bistro|qsr|food truck)\b/.test(lowered)) {
    return "small_restaurants";
  }
  return "generic";
}

function defaultKickoffGoalsForDomain(domain: ProjectDomain): string[] {
  switch (domain) {
    case "tech_product":
      return [
        "Define the core user workflow to ship first.",
        "Lock MVP scope and what is explicitly out of scope for v1.",
        "Set a concrete success bar for the first release (users, reliability, or speed).",
      ];
    case "marketing":
      return [
        "Define the primary audience and the main offer or message.",
        "Choose the first channel to test and what “good” looks like.",
        "Set launch timing and the minimum tracking you need to judge results.",
      ];
    case "sales":
      return [
        "Define your ICP and the buyer role you will sell to first.",
        "Clarify the offer, packaging, and pricing hypothesis for early calls.",
        "Set a weekly activity target (outreach volume, meetings booked, or pipeline adds).",
      ];
    case "operations":
      return [
        "Name the outcome this work should improve (speed, quality, cost, or clarity).",
        "Map the current process and where time or errors concentrate.",
        "Define a small pilot change and how you will measure before/after.",
      ];
    case "general":
    default:
      return [
        "Define MVP scope clearly.",
        "Identify and validate target users.",
        "Set success criteria for the first release.",
      ];
  }
}

function defaultKickoffTasksForDomain(domain: ProjectDomain): string[] {
  switch (domain) {
    case "tech_product":
      return [
        "List the smallest end-to-end workflow a user can complete in v1.",
        "Decide auth, data model, and hosting assumptions for the first slice.",
        "Pick a target ship date for a usable internal or friend-and-family build.",
      ];
    case "marketing":
      return [
        "Write a one-paragraph ICP and the main pain you are speaking to.",
        "Draft the first landing page or lead capture path you will send traffic to.",
        "Set up baseline tracking (pixels, UTMs, or CRM stage) before spending budget.",
      ];
    case "sales":
      return [
        "List 20–30 accounts or leads that fit your ICP for first outreach.",
        "Write a 3-email outreach sequence or call outline tied to one clear CTA.",
        "Define your first pipeline stages and what counts as a qualified opportunity.",
      ];
    case "operations":
      return [
        "Document the as-is process in bullet steps with owners and handoffs.",
        "List the top three bottlenecks or failure points to fix first.",
        "Schedule a pilot window and who will own the rollout checklist.",
      ];
    case "general":
    default:
      return [
        "Define your first 2–3 concrete goals.",
        "List the first 3 tasks to get started.",
        "Set an initial timeline and first milestone date.",
      ];
  }
}

function defaultKickoffGoals(summary: string, domain: ProjectDomain): string[] {
  const lowered = summary.toLowerCase();
  const segment = detectRestaurantSegment(summary);
  const goals =
    segment === "small_restaurants"
      ? [
          "Define the first restaurant workflow to support (reservations, orders, or basic CRM).",
          "Validate your target segment: independent restaurants vs cafes.",
          "Set MVP success metrics (weekly active venues, repeat usage, or order volume handled).",
        ]
      : segment === "chains"
        ? [
            "Define multi-location operations for chain restaurants (roles, permissions, and reporting).",
            "Prioritize chain-grade needs like branch consistency and centralized analytics.",
            "Set measurable launch criteria for pilot locations.",
          ]
        : segment === "cloud_kitchens"
          ? [
              "Define a delivery-first workflow for cloud kitchens (order intake, prep, dispatch).",
              "Prioritize integrations needed for delivery channels and fulfillment.",
              "Set MVP metrics tied to throughput and order accuracy.",
            ]
          : defaultKickoffGoalsForDomain(domain);

  if (/\bsaas\b/.test(lowered)) {
    goals.unshift("Clarify the core SaaS workflow to solve first.");
  }

  return dedupe(goals).slice(0, 3);
}

function defaultKickoffTasks(summary: string, domain: ProjectDomain): string[] {
  const lowered = summary.toLowerCase();
  const segment = detectRestaurantSegment(summary);
  const tasks =
    segment === "small_restaurants"
      ? [
          "Draft one core user flow for staff (for example: reservation to table assignment).",
          "Choose your initial ICP: small restaurants, cafes, or both.",
          "Define your first milestone and timeline for pilot launch.",
        ]
      : segment === "chains"
        ? [
            "Define pilot scope for one chain with 2-3 locations.",
            "Map branch-level roles and permissions for managers and staff.",
            "Define a milestone for first chain pilot reporting dashboard.",
          ]
        : segment === "cloud_kitchens"
          ? [
              "Map a delivery-only workflow from order intake to dispatch.",
              "List integrations needed for your first aggregator channels.",
              "Set a milestone for first kitchen pilot and throughput reporting.",
            ]
          : defaultKickoffTasksForDomain(domain);

  if (/\bsaas\b/.test(lowered)) {
    tasks.unshift("List the core features needed for your first MVP.");
  }

  return dedupe(tasks).slice(0, 4);
}

function inferKickoffProjectDomain(event: NormalizedEmailEvent): ProjectDomain {
  return inferProjectDomainFromText([
    event.subject,
    event.rawBody,
    event.parsed.summary,
    ...(event.parsed.goals ?? []),
    ...(event.parsed.notes ?? []),
  ]);
}

export function buildKickoffSummary(event: NormalizedEmailEvent): KickoffSummary {
  const projectDomain = inferKickoffProjectDomain(event);
  const baseOverview = cleanOverviewText(event.parsed.summary || event.rawBody);
  const seedMatch = extractKickoffSeed(event.rawBody);
  const seed = seedMatch.seed;
  const seedSentence = seed ? cleanOverviewText(`Project focus: ${seed}.`) : "";
  const shouldAppendBaseOverview =
    Boolean(seedSentence) &&
    Boolean(baseOverview) &&
    (seed ? !baseOverview.toLowerCase().includes(seed.toLowerCase()) : false);
  const summarySource = shouldAppendBaseOverview
    ? `${seedSentence} ${baseOverview}`
    : seedSentence || baseOverview || event.rawBody;
  const summary = compactOverviewForDocument(summarySource);
  const segment = detectRestaurantSegment(summary);
  const goals =
    event.parsed.goals.length > 0 ? dedupe(event.parsed.goals) : defaultKickoffGoals(summary, projectDomain);
  const actionItems =
    event.parsed.actionItems.length > 0
      ? dedupe(event.parsed.actionItems)
      : defaultKickoffTasks(summary, projectDomain);
  const initialNotes = event.parsed.notes.length > 0 ? [...event.parsed.notes] : [];
  const constraints: string[] = [];
  const facts = extractKickoffFacts(event.rawBody);
  const nextSteps = [
    "Great - your project is now initialized.",
    ...facts.map((line) => `Understood: ${line}`),
    segment === "generic"
      ? kickoffDomainHint(projectDomain, "workflow")
      : "Define how restaurants will use this SaaS first (reservations, orders, CRM, or loyalty).",
    segment === "generic"
      ? kickoffDomainHint(projectDomain, "tasks")
      : "Clarify your target segment: small restaurants, chains, or cloud kitchens.",
    "Share your biggest risks and key notes so planning stays grounded.",
  ];

  return { summary, goals, actionItems, initialNotes, constraints, nextSteps, projectDomain };
}

function kickoffDomainHint(domain: ProjectDomain, kind: "workflow" | "tasks"): string {
  if (kind === "workflow") {
    switch (domain) {
      case "marketing":
        return "Define your core campaign story, primary channel, and what you will measure first.";
      case "sales":
        return "Define your ICP, offer, and the first outreach motion you will run this week.";
      case "tech_product":
        return "Define the core workflow you will ship first and who it is for.";
      case "operations":
        return "Define the outcome you want and the smallest process slice to improve first.";
      case "general":
      default:
        return "Define your core workflow and target users first.";
    }
  }
  switch (domain) {
    case "marketing":
      return "List your first creative and distribution tasks with a launch timeline.";
    case "sales":
      return "List your first pipeline tasks with a weekly activity target.";
    case "tech_product":
      return "List your first build tasks with an initial milestone and timeline.";
    case "operations":
      return "List your first pilot tasks with owners and a review date.";
    case "general":
    default:
      return "List your first tasks with an initial milestone and timeline.";
  }
}

/** Structured follow-ups for the first reply; wording depends on project playbook. */
export function getKickoffFollowUpQuestions(domain: ProjectDomain = "general"): string[] {
  switch (domain) {
    case "tech_product":
      return [
        "Define your target timeline for a first usable slice.",
        "Define the primary user and the first workflow they should complete.",
        "Define your first technical milestone (for example auth + one core path).",
      ];
    case "marketing":
      return [
        "Define your launch timeline and primary success metric (for example CPL or meetings booked).",
        "Define your ICP and the main message or offer for the first test.",
        "Define your first channel test budget (even a rough range) and what you will learn from it.",
      ];
    case "sales":
      return [
        "Define your target timeline for first qualified opportunities.",
        "Define your ICP and the buyer role you will prioritize first.",
        "Define your weekly outreach or meeting target for the next two weeks.",
      ];
    case "operations":
      return [
        "Define your target timeline for the pilot change.",
        "Define who is impacted and who must approve the new way of working.",
        "Define how you will measure success after the pilot (time, errors, or throughput).",
      ];
    case "general":
    default:
      return [
        "Define your target timeline.",
        "Define your primary target users.",
        "Define your first milestone.",
      ];
  }
}
