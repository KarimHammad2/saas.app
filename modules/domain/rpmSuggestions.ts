import type { ProjectContext, ProjectDomain, UserProfileContext } from "@/modules/contracts/types";
import { inferProjectDomainFromText } from "@/modules/domain/projectDomain";

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

function copyForDomain(domain: ProjectDomain): DomainSuggestionCopy {
  switch (domain) {
    case "marketing":
      return {
        noSummary:
          "Write a one-paragraph campaign objective (who it is for and what you want them to do) and add it under Summary in your next email.",
        noRisks:
          "List the top 2–3 launch risks under Risks (for example message-market fit, tracking gaps, or budget burn).",
        noTasks: "Define your first distribution and creative tasks under Tasks (landing page, creative set, or channel setup).",
        milestones: "Break the campaign into phases (creative → test → scale) and ship one phase at a time.",
        captureDecision: "Capture one explicit decision under Decisions (for example primary channel or ICP for this test).",
        validation: "Talk to 3–5 people in your ICP about the message and offer before increasing spend.",
        focus: "Keep the first test narrow: one audience, one primary channel, and one clear conversion event.",
      };
    case "sales":
      return {
        noSummary:
          "Write a one-paragraph ICP + offer summary and add it under Summary so outreach stays consistent in your next email.",
        noRisks:
          "Add the top 2–3 risks under Risks (for example weak ICP, unclear offer, or low meeting conversion).",
        noTasks: "Define your first pipeline motions under Tasks (list build, outreach sequence, or call blocks).",
        milestones: "Break the funnel into stages (targeting → conversations → proposals) and advance one stage at a time.",
        captureDecision: "Capture one explicit decision under Decisions (for example ICP tier or pricing hypothesis).",
        validation: "Run 10–20 real conversations to test the offer and objections before scaling automation.",
        focus: "Stay disciplined on one ICP and one core offer until meetings convert predictably.",
      };
    case "operations":
      return {
        noSummary:
          "Write a short statement of the operational outcome you want and add it under Summary in your next email.",
        noRisks: "List the top 2–3 risks under Risks (for example adoption, handoff errors, or measurement gaps).",
        noTasks: "List the first concrete pilot tasks under Tasks (owners, dates, and what “done” means).",
        milestones: "Sequence the change in milestones (pilot → review → rollout) instead of big-bang everything at once.",
        captureDecision: "Capture one explicit decision under Decisions (for example pilot scope or success criteria).",
        validation: "Validate the new flow with the people doing the work weekly before expanding scope.",
        focus: "Pilot the smallest slice of the process that still produces measurable signal.",
      };
    case "tech_product":
      return {
        noSummary:
          "Write a one-paragraph problem statement for v1 and add it under Summary in your next email.",
        noRisks:
          "You haven’t defined risks yet — add the top 2–3 risks under Risks (for example scope, security, or reliability).",
        noTasks: "Define your first build tasks under Tasks (one core workflow end-to-end beats a wide feature list).",
        milestones: "Break your goals into milestones (order phases and ship one slice at a time).",
        captureDecision: "Capture one explicit decision you have already made (even if small) under Decisions.",
        validation: "Consider validating the problem with at least 5 target users before building more scope.",
        focus: "Define a simple technical scope guardrail for v1 (what you will not build yet).",
      };
    case "general":
    default:
      return {
        noSummary:
          "Write a one-paragraph summary of the problem you are solving and add it under Summary in your next email.",
        noRisks: "You haven’t defined risks yet — add the top 2–3 risks under Risks.",
        noTasks: "Define your first 3 tasks under Tasks or Action Items.",
        milestones: "Break your goals into milestones (order phases and ship one slice at a time).",
        captureDecision: "Capture one explicit decision you have already made (even if small) under Decisions.",
        validation: "Consider validating your idea with at least 5 target users before building more scope.",
        focus: "Define a simple pricing hypothesis early, even if you change it later.",
      };
  }
}

/**
 * Rule-based RPM-style suggestions from current project + profile state.
 * Replace with LLM output later if needed.
 */
export function generateRPMSuggestions(projectState: ProjectContext, userProfile: UserProfileContext): string[] {
  const domain = effectiveProjectDomain(projectState);
  const c = copyForDomain(domain);
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
