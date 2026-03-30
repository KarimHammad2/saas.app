import type { NormalizedEmailEvent } from "@/modules/contracts/types";
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

  return dedupe(facts);
}

function defaultKickoffGoals(summary: string): string[] {
  const lowered = summary.toLowerCase();
  const goals = [
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
  const tasks = [
    'Reply with a "Goals:" section containing 2-3 concrete goals.',
    'Reply with a "Tasks:" section listing the first 3 execution tasks.',
    "Define a first timeline and milestone date.",
  ];

  if (/\bsaas\b/.test(lowered)) {
    tasks.unshift("List the core features needed for your first MVP.");
  }

  return dedupe(tasks).slice(0, 4);
}

export function buildKickoffSummary(event: NormalizedEmailEvent): KickoffSummary {
  const summary = compactOverviewForDocument(event.parsed.summary || event.rawBody);
  const goals = event.parsed.goals.length > 0 ? dedupe(event.parsed.goals) : defaultKickoffGoals(summary);
  const actionItems =
    event.parsed.actionItems.length > 0 ? dedupe(event.parsed.actionItems) : defaultKickoffTasks(summary);
  const initialNotes = event.parsed.notes.length > 0 ? [...event.parsed.notes] : [];
  const constraints: string[] = [];
  const facts = extractKickoffFacts(event.rawBody);
  const nextSteps = [
    "Great - your project is now initialized.",
    ...facts.map((line) => `Understood: ${line}`),
    "To move forward, I recommend defining your goals and target users first.",
    'Reply to this thread with sections like "Goals:", "Tasks:", "Risks:", and "Notes:".',
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
