import type { NormalizedEmailEvent } from "@/modules/contracts/types";
import { cleanOverviewText } from "@/modules/domain/overviewCleaning";
import { compactOverviewForDocument } from "@/modules/output/overviewText";

export interface KickoffSummary {
  summary: string;
  goals: string[];
  actionItems: string[];
  initialNotes: string[];
  constraints: string[];
  nextSteps: string[];
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

function defaultKickoffGoals(summary: string): string[] {
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
          : [
              "Define MVP scope clearly.",
              "Identify and validate target users.",
              "Set success criteria for the first release.",
            ];

  if (/\bsaas\b/.test(lowered)) {
    goals.unshift("Clarify the core SaaS workflow to solve first.");
  }

  return dedupe(goals).slice(0, 3);
}

function defaultKickoffTasks(summary: string): string[] {
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
          : [
              "Define your first 2-3 concrete goals.",
              "List the first 3 tasks to get started.",
              "Set an initial timeline and first milestone date.",
            ];

  if (/\bsaas\b/.test(lowered)) {
    tasks.unshift("List the core features needed for your first MVP.");
  }

  return dedupe(tasks).slice(0, 4);
}

export function buildKickoffSummary(event: NormalizedEmailEvent): KickoffSummary {
  const cleanedOverview = cleanOverviewText(event.parsed.summary || event.rawBody);
  const summary = compactOverviewForDocument(cleanedOverview || event.rawBody);
  const segment = detectRestaurantSegment(summary);
  const goals = event.parsed.goals.length > 0 ? dedupe(event.parsed.goals) : defaultKickoffGoals(summary);
  const actionItems =
    event.parsed.actionItems.length > 0 ? dedupe(event.parsed.actionItems) : defaultKickoffTasks(summary);
  const initialNotes = event.parsed.notes.length > 0 ? [...event.parsed.notes] : [];
  const constraints: string[] = [];
  const facts = extractKickoffFacts(event.rawBody);
  const nextSteps = [
    "Great - your project is now initialized.",
    ...facts.map((line) => `Understood: ${line}`),
    segment === "generic"
      ? "Define your core workflow and target users first."
      : "Define how restaurants will use this SaaS first (reservations, orders, CRM, or loyalty).",
    segment === "generic"
      ? "List your first tasks with an initial milestone and timeline."
      : "Clarify your target segment: small restaurants, chains, or cloud kitchens.",
    "Share your biggest risks and key notes so planning stays grounded.",
  ];

  return { summary, goals, actionItems, initialNotes, constraints, nextSteps };
}

/** Structured follow-ups for the first reply (timeline, budget, users). */
export function getKickoffFollowUpQuestions(): string[] {
  return [
    "Define your target timeline.",
    "Define your primary target users.",
    "Define your first milestone.",
  ];
}
