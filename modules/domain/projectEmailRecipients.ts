import type { ProjectContext } from "@/modules/contracts/types";

/** Primary recipients for project update emails: owner, participants, and assigned RPM (when present). */
export function buildProjectEmailRecipientList(projectState: ProjectContext): string[] {
  const normalizeEmail = (value: string | null | undefined): string | null => {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.includes("@") ? normalized : null;
  };

  const owner = normalizeEmail(projectState.ownerEmail);
  const participants = (projectState.participants ?? [])
    .map((entry) => normalizeEmail(entry))
    .filter((entry): entry is string => entry !== null);
  const raw = owner ? [owner, ...participants] : participants;

  const rpm = normalizeEmail(projectState.activeRpmEmail);
  if (rpm) {
    raw.push(rpm);
  }
  return Array.from(new Set(raw));
}
