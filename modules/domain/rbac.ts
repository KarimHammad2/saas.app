import { getMasterUserEmail } from "@/lib/env";
import type { ActorRole } from "@/modules/contracts/types";

export function resolveActorRole(input: {
  senderEmail: string;
  primaryUserEmail: string;
  activeRpmEmail: string | null;
}): ActorRole {
  const sender = input.senderEmail.trim().toLowerCase();
  const primary = input.primaryUserEmail.trim().toLowerCase();
  const rpm = input.activeRpmEmail?.trim().toLowerCase() ?? null;
  const master = getMasterUserEmail();

  if (sender === master) {
    return "master";
  }

  if (sender === primary) {
    return "user";
  }

  if (rpm && sender === rpm) {
    return "rpm";
  }

  return "user";
}

export function canModifyUserProfile(role: ActorRole): boolean {
  return role === "user" || role === "master";
}

/** UserProfile: / approvals only from the project owner or master (not collaborators misclassified as user). */
export function canApplyInboundUserProfileEdit(
  role: ActorRole,
  senderEmail: string,
  ownerEmail: string | null | undefined,
): boolean {
  if (!canModifyUserProfile(role)) {
    return false;
  }
  if (role === "master") {
    return true;
  }
  const owner = ownerEmail?.trim().toLowerCase() ?? "";
  if (!owner) {
    return false;
  }
  return senderEmail.trim().toLowerCase() === owner;
}

/** Assign RPM: block — only account owner or master (same gate as UserProfile edits). */
export function canAssignProjectRpmViaInbound(
  role: ActorRole,
  senderEmail: string,
  ownerEmail: string | null | undefined,
): boolean {
  return canApplyInboundUserProfileEdit(role, senderEmail, ownerEmail);
}

export function canProposeUserProfile(role: ActorRole): boolean {
  return role === "user" || role === "rpm" || role === "master";
}

export function canApproveTransaction(role: ActorRole): boolean {
  return role === "user" || role === "master";
}
