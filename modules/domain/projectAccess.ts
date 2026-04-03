import { getMasterUserEmail } from "@/lib/env";

export function canSenderUpdateProject(input: {
  senderEmail: string;
  ownerEmail: string | null | undefined;
  participantEmails: string[];
  activeRpmEmail: string | null | undefined;
}): boolean {
  const s = input.senderEmail.trim().toLowerCase();
  const master = getMasterUserEmail().trim().toLowerCase();
  if (s === master) {
    return true;
  }
  const owner = input.ownerEmail?.trim().toLowerCase();
  if (owner && s === owner) {
    return true;
  }
  const rpm = input.activeRpmEmail?.trim().toLowerCase();
  if (rpm && s === rpm) {
    return true;
  }
  const participants = input.participantEmails ?? [];
  return participants.some((p) => p.trim().toLowerCase() === s);
}
