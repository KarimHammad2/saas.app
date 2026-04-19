/**
 * Solopreneur → Agency RPM policy:
 * - Bulk: on tier transition into `agency`, every owned project whose active RPM is the master user (Daniel)
 *   is updated: assign `agency_default_rpm_email` when set, otherwise clear the active RPM assignment.
 * - Kickoff under agency never auto-assigns the master user; only `agency_default_rpm_email` when present.
 */

export type AgencyRpmReplacementPlan = "noop" | "assign" | "clear";

export function planAgencyRpmReplacement(
  masterEmailNormalized: string,
  activeRpm: string | null | undefined,
  agencyDefaultRpm: string | null | undefined,
): AgencyRpmReplacementPlan {
  const m = masterEmailNormalized.trim().toLowerCase();
  const current = activeRpm?.trim().toLowerCase() ?? "";
  if (!current || current !== m) {
    return "noop";
  }
  const candidate = agencyDefaultRpm?.trim().toLowerCase() ?? "";
  if (candidate && candidate !== m) {
    return "assign";
  }
  return "clear";
}
