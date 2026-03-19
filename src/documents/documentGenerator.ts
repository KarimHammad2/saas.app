import type { ProjectStateDocument } from "@/src/types/project.types";

function section(title: string, values: string[]): string {
  const lines = values.length > 0 ? values : ["None"];
  return [`## ${title}`, ...lines.map((line) => `- ${line}`)].join("\n");
}

export function generateProjectDocument(projectState: ProjectStateDocument): string {
  const timeline = projectState.timeline.length > 0 ? projectState.timeline : [];
  const timelineLines = timeline.length > 0 ? timeline.map((item) => `- ${item.timestamp}: ${item.summary}`) : ["- None"];

  return [
    "# Project Overview",
    projectState.overview || "No overview yet.",
    "",
    section("Goals", projectState.goals),
    "",
    section("Tasks", projectState.tasks),
    "",
    section("Risks", projectState.risks),
    "",
    "## Timeline",
    ...timelineLines,
    "",
    section("Notes", projectState.notes),
    "",
    section("Decisions", projectState.decisions),
  ].join("\n");
}
