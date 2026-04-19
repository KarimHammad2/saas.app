import type { ProjectContext } from "@/modules/contracts/types";

/** Primary recipients for project update emails: owner, participants, and RPM when human oversight applies. */
export function buildProjectEmailRecipientList(projectState: ProjectContext): string[] {
  const raw = [projectState.ownerEmail, ...(projectState.participants ?? [])].filter(
    (entry): entry is string => typeof entry === "string" && entry.includes("@"),
  );
  const rpm = projectState.activeRpmEmail?.trim();
  if (projectState.featureFlags?.oversight && rpm && rpm.includes("@")) {
    raw.push(rpm.toLowerCase());
  }
  return Array.from(new Set(raw.map((e) => e.trim().toLowerCase())));
}
