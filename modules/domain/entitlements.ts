import type { Tier } from "@/modules/contracts/types";

export type PlanPackage = "solo" | "agency";

export interface PlanEntitlements {
  package: PlanPackage;
  allowCollaborators: boolean;
  allowHumanOversight: boolean;
}

export function resolvePlanEntitlements(tier: Tier): PlanEntitlements {
  if (tier === "agency") {
    return {
      package: "agency",
      allowCollaborators: true,
      allowHumanOversight: true,
    };
  }

  return {
    package: "solo",
    allowCollaborators: false,
    allowHumanOversight: true,
  };
}

export function filterParticipantEmailsByEntitlements(input: {
  candidateEmails: string[];
  existingParticipantEmails: string[];
  ownerEmail: string | null | undefined;
  activeRpmEmail: string | null | undefined;
  entitlements: PlanEntitlements;
}): string[] {
  const normalized = (value: string) => value.trim().toLowerCase();
  const candidates = input.candidateEmails.map(normalized).filter(Boolean);
  if (input.entitlements.allowCollaborators) {
    return candidates;
  }

  const allowed = new Set<string>([
    ...(input.existingParticipantEmails ?? []).map(normalized),
    input.ownerEmail ? normalized(input.ownerEmail) : "",
    input.activeRpmEmail ? normalized(input.activeRpmEmail) : "",
  ]);
  allowed.delete("");
  return candidates.filter((email) => allowed.has(email));
}
