import type { ActorRole, NormalizedEmailEvent } from "@/modules/contracts/types";
import { canProposeUserProfile } from "@/modules/domain/rbac";

/**
 * True when the inbound message is only a UserProfile Suggestion (no other parsed project/profile/transaction updates).
 * Used to send a lightweight proposal email without the project-document attachment.
 */
export function isUserProfileSuggestionOnlyInbound(event: NormalizedEmailEvent, role: ActorRole): boolean {
  if (!canProposeUserProfile(role) || !event.parsed.rpmSuggestion?.content?.trim()) {
    return false;
  }
  /** Lightweight proposal mail is for human RPM or master; owners use full updates or direct UserProfile:. */
  if (role !== "rpm" && role !== "master") {
    return false;
  }
  const p = event.parsed;
  if (p.projectStatus) {
    return false;
  }
  if (p.goals.length > 0) {
    return false;
  }
  if (p.actionItems.length > 0) {
    return false;
  }
  if (p.completedTasks.length > 0) {
    return false;
  }
  if (p.decisions.length > 0) {
    return false;
  }
  if (p.risks.length > 0) {
    return false;
  }
  if (p.recommendations.length > 0) {
    return false;
  }
  if (p.notes.length > 0) {
    return false;
  }
  if (p.userProfileContext?.trim()) {
    return false;
  }
  if (p.transactionEvent) {
    return false;
  }
  if (p.approvals.length > 0) {
    return false;
  }
  if (p.additionalEmails.length > 0) {
    return false;
  }
  if (p.projectName?.trim()) {
    return false;
  }
  if (p.correction?.trim()) {
    return false;
  }
  if (p.summary?.trim()) {
    return false;
  }
  if (p.currentStatus?.trim()) {
    return false;
  }
  return true;
}
