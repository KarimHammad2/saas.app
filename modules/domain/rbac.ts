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

export function canProposeUserProfile(role: ActorRole): boolean {
  return role === "user" || role === "rpm" || role === "master";
}

export function canApproveTransaction(role: ActorRole): boolean {
  return role === "user" || role === "master";
}
