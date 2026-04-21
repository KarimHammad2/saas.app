import type { NormalizedEmailEvent, ProjectDomain } from "@/modules/contracts/types";
import { extractKickoffSeed } from "@/modules/domain/kickoffSeed";
import { inferProjectDomainFromText } from "@/modules/domain/projectDomain";
import { stableVariantIndex, type PlaybookVariant } from "@/modules/domain/playbookVariant";
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

const DOMAIN_GOAL_PAIRS: Record<ProjectDomain, readonly [string[], string[]]> = {
  general: [
    ["Define MVP scope clearly.", "Identify and validate target users.", "Set success criteria for the first release."],
    [
      "Write a crisp problem statement for v1 (who hurts and how).",
      "Pick the smallest outcome you could ship or prove first.",
      "Decide how you will know the first version or experiment worked.",
    ],
  ],
  tech_product: [
    [
      "Define the core user workflow to ship first.",
      "Lock MVP scope and what is explicitly out of scope for v1.",
      "Set a concrete success bar for the first release (users, reliability, or speed).",
    ],
    [
      "Choose a north-star metric for the first workflow (activation, retention, or task success).",
      "List explicit non-goals for v1 so scope does not creep.",
      "Agree what “done” means for an internal or friend-and-family release.",
    ],
  ],
  marketing: [
    [
      "Define the primary audience and the main offer or message.",
      "Choose the first channel to test and what “good” looks like.",
      "Set launch timing and the minimum tracking you need to judge results.",
    ],
    [
      "Name the main conversion (lead, call, trial) and the minimum viable funnel to support it.",
      "Pick one competitor or reference campaign to benchmark messaging and creative bar.",
      "Define a learning plan for the first 2 weeks (what you will change based on data).",
    ],
  ],
  sales: [
    [
      "Define your ICP and the buyer role you will sell to first.",
      "Clarify the offer, packaging, and pricing hypothesis for early calls.",
      "Set a weekly activity target (outreach volume, meetings booked, or pipeline adds).",
    ],
    [
      "Write a one-page narrative: pain, outcome, and why you vs status quo or DIY.",
      "List disqualifiers so you do not waste cycles on bad-fit leads.",
      "Pick one channel (email, LinkedIn, phone) to master before adding more.",
    ],
  ],
  operations: [
    [
      "Name the outcome this work should improve (speed, quality, cost, or clarity).",
      "Map the current process and where time or errors concentrate.",
      "Define a small pilot change and how you will measure before/after.",
    ],
    [
      "Identify stakeholders who must adopt the change and what “good” looks like for each.",
      "Capture the top recurring exceptions or workarounds people use today.",
      "Set a rollback or safety plan if the pilot creates unintended load.",
    ],
  ],
};

const DOMAIN_TASK_PAIRS: Record<ProjectDomain, readonly [string[], string[]]> = {
  general: [
    ["Define your first 2–3 concrete goals.", "List the first 3 tasks to get started.", "Set an initial timeline and first milestone date."],
    [
      "Schedule a 30-minute scoping session with yourself or the team and capture decisions.",
      "Write down three unknowns you need to answer before spending more time.",
      "Pick one stakeholder or user to sanity-check the plan this week.",
    ],
  ],
  tech_product: [
    [
      "List the smallest end-to-end workflow a user can complete in v1.",
      "Decide auth, data model, and hosting assumptions for the first slice.",
      "Pick a target ship date for a usable internal or friend-and-family build.",
    ],
    [
      "Sketch the data you must store for the first workflow (entities and relationships).",
      "List integrations you can defer until after the first working slice.",
      "Book a short weekly review until the first slice ships.",
    ],
  ],
  marketing: [
    [
      "Write a one-paragraph ICP and the main pain you are speaking to.",
      "Draft the first landing page or lead capture path you will send traffic to.",
      "Set up baseline tracking (pixels, UTMs, or CRM stage) before spending budget.",
    ],
    [
      "Collect 5–10 example ads or landing pages you admire in your space.",
      "Draft two headline angles and one primary CTA for the first test.",
      "Define a weekly check-in rhythm to review spend, CTR, and conversion.",
    ],
  ],
  sales: [
    [
      "List 20–30 accounts or leads that fit your ICP for first outreach.",
      "Write a 3-email outreach sequence or call outline tied to one clear CTA.",
      "Define your first pipeline stages and what counts as a qualified opportunity.",
    ],
    [
      "Build a lightweight CRM view or spreadsheet with stage, next step, and owner.",
      "Record your top 5 objection hypotheses and a one-line response for each.",
      "Block calendar time for outbound blocks so activity stays consistent.",
    ],
  ],
  operations: [
    [
      "Document the as-is process in bullet steps with owners and handoffs.",
      "List the top three bottlenecks or failure points to fix first.",
      "Schedule a pilot window and who will own the rollout checklist.",
    ],
    [
      "Run a quick time study or ticket sample on the bottleneck step.",
      "Draft the “to-be” flow in no more than 10 bullets.",
      "List training or comms needed before the pilot goes live.",
    ],
  ],
};

function defaultKickoffGoalsForDomain(domain: ProjectDomain, variant: PlaybookVariant): string[] {
  const pair = DOMAIN_GOAL_PAIRS[domain];
  return [...pair[variant]];
}

function defaultKickoffTasksForDomain(domain: ProjectDomain, variant: PlaybookVariant): string[] {
  const pair = DOMAIN_TASK_PAIRS[domain];
  return [...pair[variant]];
}

function defaultKickoffGoals(summary: string, domain: ProjectDomain, variant: PlaybookVariant): string[] {
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
          : defaultKickoffGoalsForDomain(domain, variant);

  if (/\bsaas\b/.test(lowered)) {
    goals.unshift("Clarify the core SaaS workflow to solve first.");
  }

  return dedupe(goals).slice(0, 3);
}

function defaultKickoffTasks(summary: string, domain: ProjectDomain, variant: PlaybookVariant): string[] {
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
          : defaultKickoffTasksForDomain(domain, variant);

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

export function buildKickoffSummary(event: NormalizedEmailEvent, projectId: string): KickoffSummary {
  const variant = stableVariantIndex(projectId) as PlaybookVariant;
  const projectDomain = inferKickoffProjectDomain(event);
  const seedMatch = extractKickoffSeed(event.rawBody);
  // For large free-form emails, the seed's source paragraph is a much better
  // overview base than the full raw body (which is dominated by greeting/intro).
  const overviewSource = event.parsed.summary || seedMatch.sourceParagraph || event.rawBody;
  const baseOverview = cleanOverviewText(overviewSource);
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
    event.parsed.goals.length > 0 ? dedupe(event.parsed.goals) : defaultKickoffGoals(summary, projectDomain, variant);
  const actionItems =
    event.parsed.actionItems.length > 0
      ? dedupe(event.parsed.actionItems)
      : defaultKickoffTasks(summary, projectDomain, variant);
  const initialNotes = event.parsed.notes.length > 0 ? [...event.parsed.notes] : [];
  const constraints: string[] = [];
  const facts = extractKickoffFacts(event.rawBody);
  const nextSteps = [
    "Great - your project is now initialized.",
    ...facts.map((line) => `Understood: ${line}`),
    segment === "generic"
      ? kickoffDomainHint(projectDomain, "workflow", variant)
      : "Define how restaurants will use this SaaS first (reservations, orders, CRM, or loyalty).",
    segment === "generic"
      ? kickoffDomainHint(projectDomain, "tasks", variant)
      : "Clarify your target segment: small restaurants, chains, or cloud kitchens.",
    "Share your biggest risks and key notes so planning stays grounded.",
  ];

  return { summary, goals, actionItems, initialNotes, constraints, nextSteps, projectDomain };
}

const KICKOFF_HINT_WORKFLOW: Record<ProjectDomain, readonly [string, string]> = {
  marketing: [
    "Define your core campaign story, primary channel, and what you will measure first.",
    "Align on the main promise, the primary audience, and the one metric that proves traction.",
  ],
  sales: [
    "Define your ICP, offer, and the first outreach motion you will run this week.",
    "Sharpen who you will ignore for now so outreach stays focused and repeatable.",
  ],
  tech_product: [
    "Define the core workflow you will ship first and who it is for.",
    "Pick the smallest shippable slice that proves value to one user type.",
  ],
  operations: [
    "Define the outcome you want and the smallest process slice to improve first.",
    "Name the customer or internal pain you are fixing with this change.",
  ],
  general: [
    "Define your core workflow and target users first.",
    "Write one sentence on the problem and who feels it most acutely.",
  ],
};

const KICKOFF_HINT_TASKS: Record<ProjectDomain, readonly [string, string]> = {
  marketing: [
    "List your first creative and distribution tasks with a launch timeline.",
    "Break work into brief, asset, and distribution tasks with owners and dates.",
  ],
  sales: [
    "List your first pipeline tasks with a weekly activity target.",
    "Sequence list-building, first touches, and follow-ups for the next 10 business days.",
  ],
  tech_product: [
    "List your first build tasks with an initial milestone and timeline.",
    "List environment, data, and UI tasks needed for one happy-path demo.",
  ],
  operations: [
    "List your first pilot tasks with owners and a review date.",
    "List communication and training tasks before go-live.",
  ],
  general: [
    "List your first tasks with an initial milestone and timeline.",
    "Pick three tasks you can finish in the next week to reduce uncertainty.",
  ],
};

function kickoffDomainHint(domain: ProjectDomain, kind: "workflow" | "tasks", variant: PlaybookVariant): string {
  if (kind === "workflow") {
    return KICKOFF_HINT_WORKFLOW[domain][variant];
  }
  return KICKOFF_HINT_TASKS[domain][variant];
}

const FOLLOW_UP_QUESTION_PAIRS: Record<ProjectDomain, readonly [string[], string[]]> = {
  tech_product: [
    [
      "Define your target timeline for a first usable slice.",
      "Define the primary user and the first workflow they should complete.",
      "Define your first technical milestone (for example auth + one core path).",
    ],
    [
      "When do you want a demo-ready build, even if rough?",
      "Who is the first user persona you will design screens and copy for?",
      "What is the riskiest assumption in v1 that you want to validate first?",
    ],
  ],
  marketing: [
    [
      "Define your launch timeline and primary success metric (for example CPL or meetings booked).",
      "Define your ICP and the main message or offer for the first test.",
      "Define your first channel test budget (even a rough range) and what you will learn from it.",
    ],
    [
      "What date do you want the first experiment live, even if small?",
      "Which single channel will you learn on before scaling spend?",
      "What creative or landing asset must exist before you turn on traffic?",
    ],
  ],
  sales: [
    [
      "Define your target timeline for first qualified opportunities.",
      "Define your ICP and the buyer role you will prioritize first.",
      "Define your weekly outreach or meeting target for the next two weeks.",
    ],
    [
      "How many qualified conversations do you want in the next 30 days?",
      "What is your minimum viable offer for the first calls?",
      "What is your daily or weekly outbound quota you can sustain?",
    ],
  ],
  operations: [
    [
      "Define your target timeline for the pilot change.",
      "Define who is impacted and who must approve the new way of working.",
      "Define how you will measure success after the pilot (time, errors, or throughput).",
    ],
    [
      "How long should the pilot run before you decide scale vs rollback?",
      "Who owns the checklist during the pilot week by week?",
      "What is the one dashboard or report that proves the pilot worked?",
    ],
  ],
  general: [
    ["Define your target timeline.", "Define your primary target users.", "Define your first milestone."],
    [
      "What timeline feels realistic for the first testable slice?",
      "Who is the first person you want feedback from?",
      "What is the smallest first milestone that would still feel like progress?",
    ],
  ],
};

/** Structured follow-ups for the first reply; wording depends on project playbook and A/B variant. */
export function getKickoffFollowUpQuestions(
  domain: ProjectDomain = "general",
  variant: PlaybookVariant = 0,
): string[] {
  return [...FOLLOW_UP_QUESTION_PAIRS[domain][variant]];
}
