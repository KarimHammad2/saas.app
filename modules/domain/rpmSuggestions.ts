import type { ProjectContext, ProjectDomain, UserProfileContext } from "@/modules/contracts/types";
import type { PlaybookVariant } from "@/modules/domain/playbookVariant";
import { inferProjectDomainFromText } from "@/modules/domain/projectDomain";
import { stableVariantIndex } from "@/modules/domain/playbookVariant";

const SYSTEM_SENDER = "system@saas2.app";

function effectiveProjectDomain(projectState: ProjectContext): ProjectDomain {
  if (projectState.projectDomain) {
    return projectState.projectDomain;
  }
  return inferProjectDomainFromText([
    projectState.summary,
    projectState.initialSummary,
    ...projectState.goals,
    ...projectState.notes,
  ]);
}

interface DomainSuggestionCopy {
  noSummary: string;
  noRisks: string;
  noTasks: string;
  milestones: string;
  captureDecision: string;
  validation: string;
  focus: string;
}

const DOMAIN_RPM_COPY_PAIRS: Record<ProjectDomain, readonly [DomainSuggestionCopy, DomainSuggestionCopy]> = {
  marketing: [
    {
      noSummary:
        "Write a one-paragraph campaign objective (who it is for and what you want them to do) and add it under Summary in your next email.",
      noRisks:
        "List the top 2–3 launch risks under Risks (for example message-market fit, tracking gaps, or budget burn).",
      noTasks:
        "Define your first distribution and creative tasks under Tasks (landing page, creative set, or channel setup).",
      milestones: "Break the campaign into phases (creative → test → scale) and ship one phase at a time.",
      captureDecision: "Capture one explicit decision under Decisions (for example primary channel or ICP for this test).",
      validation: "Talk to 3–5 people in your ICP about the message and offer before increasing spend.",
      focus: "Keep the first test narrow: one audience, one primary channel, and one clear conversion event.",
    },
    {
      noSummary:
        "Add a short Summary: target segment, promise, and the one action you want after the first click.",
      noRisks: "Under Risks, note creative fatigue, tracking loss (iOS / consent), and learning speed vs burn rate.",
      noTasks: "Under Tasks, list asset specs (headlines, hooks, landing sections) and who produces each piece.",
      milestones: "Milestone the work as: message fit → one live ad set → review → iterate; avoid parallel channels on day one.",
      captureDecision: "Decide and log under Decisions: primary KPI (CPL, CPA, or meetings) and the minimum sample before you change creative.",
      validation: "Grab 5 verbatim quotes from prospects on why they would click or ignore this offer before scaling.",
      focus: "Cap variables: one landing URL, one primary CTA, and one budget cell you watch daily for the first week.",
    },
  ],
  sales: [
    {
      noSummary:
        "Write a one-paragraph ICP + offer summary and add it under Summary so outreach stays consistent in your next email.",
      noRisks:
        "Add the top 2–3 risks under Risks (for example weak ICP, unclear offer, or low meeting conversion).",
      noTasks: "Define your first pipeline motions under Tasks (list build, outreach sequence, or call blocks).",
      milestones: "Break the funnel into stages (targeting → conversations → proposals) and advance one stage at a time.",
      captureDecision: "Capture one explicit decision under Decisions (for example ICP tier or pricing hypothesis).",
      validation: "Run 10–20 real conversations to test the offer and objections before scaling automation.",
      focus: "Stay disciplined on one ICP and one core offer until meetings convert predictably.",
    },
    {
      noSummary: "Summarize in one paragraph: who you help, the outcome you sell, and the first step on a call.",
      noRisks: "List risks like list quality, deliverability, no-show rate, or discounting too early under Risks.",
      noTasks: "Add Tasks for list sourcing, touch pattern (email/call/social), and CRM hygiene for the first 50 targets.",
      milestones: "Stage goals: first replies → first meetings → first qualified opps; improve one conversion at a time.",
      captureDecision: "Record under Decisions your meeting definition and what disqualifies a lead immediately.",
      validation: "Listen for 3 recurring objections and write a tight response for each before widening the list.",
      focus: "Keep one sequence and one CTA until reply rate stabilizes; then tweak subject or hook—not everything at once.",
    },
  ],
  operations: [
    {
      noSummary:
        "Write a short statement of the operational outcome you want and add it under Summary in your next email.",
      noRisks: "List the top 2–3 risks under Risks (for example adoption, handoff errors, or measurement gaps).",
      noTasks: "List the first concrete pilot tasks under Tasks (owners, dates, and what “done” means).",
      milestones: "Sequence the change in milestones (pilot → review → rollout) instead of big-bang everything at once.",
      captureDecision: "Capture one explicit decision under Decisions (for example pilot scope or success criteria).",
      validation: "Validate the new flow with the people doing the work weekly before expanding scope.",
      focus: "Pilot the smallest slice of the process that still produces measurable signal.",
    },
    {
      noSummary: "State the operational outcome in Summary: faster cycle time, fewer errors, lower cost, or clearer ownership.",
      noRisks: "Capture risks: shadow processes, tool overload, training debt, or compliance gaps under Risks.",
      noTasks: "Under Tasks, name who updates SOPs, who trains, and who checks compliance after go-live.",
      milestones: "Plan milestones: shadow current state → pilot in one team → retro → expand with a checklist.",
      captureDecision: "Log under Decisions the rollback trigger (what metric or signal stops the rollout).",
      validation: "Run a tabletop walkthrough with frontline staff before the pilot week.",
      focus: "Change one handoff or approval path first; avoid rewiring the whole org map in v1.",
    },
  ],
  tech_product: [
    {
      noSummary:
        "Write a one-paragraph problem statement for v1 and add it under Summary in your next email.",
      noRisks:
        "You haven’t defined risks yet — add the top 2–3 risks under Risks (for example scope, security, or reliability).",
      noTasks: "Define your first build tasks under Tasks (one core workflow end-to-end beats a wide feature list).",
      milestones: "Break your goals into milestones (order phases and ship one slice at a time).",
      captureDecision: "Capture one explicit decision you have already made (even if small) under Decisions.",
      validation: "Consider validating the problem with at least 5 target users before building more scope.",
      focus: "Define a simple technical scope guardrail for v1 (what you will not build yet).",
    },
    {
      noSummary: "Summarize v1 in Summary: user, job-to-be-done, and the smallest workflow that proves value.",
      noRisks: "Add engineering risks under Risks: data model drift, auth edge cases, third-party limits, or perf hotspots.",
      noTasks: "List Tasks as vertical slices (UI + API + data) rather than horizontal layers only.",
      milestones: "Milestone by demo milestones: local happy path → staging with auth → limited beta.",
      captureDecision: "Under Decisions, note your hosting, branching, and release cadence assumptions for v1.",
      validation: "Ship a clickable or scriptable demo to 3 users and capture where they hesitate or misunderstand.",
      focus: "Freeze integrations: pick the minimum external APIs and defer the rest until the core path is stable.",
    },
  ],
  general: [
    {
      noSummary:
        "Write a one-paragraph summary of the problem you are solving and add it under Summary in your next email.",
      noRisks: "You haven’t defined risks yet — add the top 2–3 risks under Risks.",
      noTasks: "Define your first 3 tasks under Tasks or Action Items.",
      milestones: "Break your goals into milestones (order phases and ship one slice at a time).",
      captureDecision: "Capture one explicit decision you have already made (even if small) under Decisions.",
      validation: "Consider validating your idea with at least 5 target users before building more scope.",
      focus: "Define a simple pricing hypothesis early, even if you change it later.",
    },
    {
      noSummary: "Add a Summary paragraph: who it helps, what changes for them, and what you will do first.",
      noRisks: "Under Risks, capture scope creep, dependency on one person, and unclear success criteria.",
      noTasks: "Under Tasks, pick three concrete next actions with owners and dates for the next 7 days.",
      milestones: "Sequence milestones as: clarify scope → reduce unknowns → ship or test a thin slice.",
      captureDecision: "Log one decision under Decisions: in-scope vs out-of-scope for the next two weeks.",
      validation: "Talk to a few stakeholders or users and write down one surprise they surfaced.",
      focus: "Pick one success metric for the next milestone so tradeoffs stay obvious.",
    },
  ],
};

function copyForDomain(domain: ProjectDomain, variant: PlaybookVariant): DomainSuggestionCopy {
  return DOMAIN_RPM_COPY_PAIRS[domain][variant];
}

/**
 * Rule-based RPM-style suggestions from current project + profile state.
 * Replace with LLM output later if needed.
 */
export function generateRPMSuggestions(projectState: ProjectContext, userProfile: UserProfileContext): string[] {
  const domain = effectiveProjectDomain(projectState);
  const variant = stableVariantIndex(projectState.projectId) as PlaybookVariant;
  const c = copyForDomain(domain, variant);
  const lines: string[] = [];

  if (projectState.goals.length === 0 && !projectState.summary?.trim()) {
    lines.push(c.noSummary);
  }

  if (projectState.risks.length === 0) {
    lines.push(c.noRisks);
  }

  if (projectState.actionItems.length === 0) {
    lines.push(c.noTasks);
  }

  if (projectState.goals.length > 0) {
    lines.push(c.milestones);
  }

  if (projectState.decisions.length === 0 && projectState.goals.length > 0) {
    lines.push(c.captureDecision);
  }

  if (projectState.recommendations.length === 0) {
    lines.push(c.validation);
  }

  const mvpHint =
    /\bmvp\b|mvp_first/i.test(JSON.stringify(projectState)) || userProfile.structuredContext?.goals_style === "mvp_first";
  if (mvpHint) {
    lines.push("Stay focused on a thin MVP: ship one core workflow before expanding features.");
  } else {
    lines.push(c.focus);
  }

  return Array.from(new Set(lines)).slice(0, 5);
}

export function getSystemRpmSenderEmail(): string {
  return SYSTEM_SENDER;
}
