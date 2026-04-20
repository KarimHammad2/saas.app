import { describe, expect, it } from "vitest";
import { applyTierFinancials } from "@/modules/domain/financial";
import { getNextTier } from "@/modules/domain/pricing";
import {
  canApplyInboundUserProfileEdit,
  canApproveTransaction,
  canAssignProjectRpmViaInbound,
  canModifyUserProfile,
  resolveActorRole,
} from "@/modules/domain/rbac";

describe("domain logic", () => {
  it("does not promote freemium on transaction alone (upgrade after payment ack)", () => {
    const tier = getNextTier({
      currentTier: "freemium",
      hasTransactionEvent: true,
      totalAccountEmails: 1,
    });
    expect(tier).toBe("freemium");
  });

  it("transitions to agency when multiple account emails exist", () => {
    const tier = getNextTier({
      currentTier: "solopreneur",
      hasTransactionEvent: false,
      totalAccountEmails: 2,
    });
    expect(tier).toBe("agency");
  });

  it("applies solopreneur hour split (same as freemium for non-agency tiers)", () => {
    const event = applyTierFinancials(
      {
        hoursPurchased: 20,
        hourlyRate: 50,
        allocatedHours: 999,
        bufferHours: 999,
        saas2Fee: 999,
        projectRemainder: 999,
      },
      "solopreneur",
    );

    expect(event.allocatedHours).toBe(18);
    expect(event.bufferHours).toBe(2);
    expect(event.saas2Fee).toBe(1);
    expect(event.projectRemainder).toBe(1);
  });

  it("preserves rateCurrency through applyTierFinancials", () => {
    const event = applyTierFinancials(
      {
        hoursPurchased: 10,
        hourlyRate: 100,
        rateCurrency: "cad",
        allocatedHours: 0,
        bufferHours: 0,
        saas2Fee: 0,
        projectRemainder: 0,
      },
      "solopreneur",
    );
    expect(event.rateCurrency).toBe("cad");
  });

  it("applies freemium hour split using solo rates", () => {
    const event = applyTierFinancials(
      {
        hoursPurchased: 20,
        hourlyRate: 50,
        allocatedHours: 0,
        bufferHours: 0,
        saas2Fee: 0,
        projectRemainder: 0,
      },
      "freemium",
    );
    expect(event.allocatedHours).toBe(18);
    expect(event.saas2Fee).toBe(1);
    expect(event.projectRemainder).toBe(1);
  });

  it("applies agency hour split", () => {
    const event = applyTierFinancials(
      {
        hoursPurchased: 20,
        hourlyRate: 50,
        allocatedHours: 0,
        bufferHours: 0,
        saas2Fee: 0,
        projectRemainder: 0,
      },
      "agency",
    );
    expect(event.allocatedHours).toBe(18);
    expect(event.bufferHours).toBe(2);
    expect(event.saas2Fee).toBe(0.5);
    expect(event.projectRemainder).toBe(1.5);
  });

  it("enforces role checks", () => {
    const role = resolveActorRole({
      senderEmail: "rpm@example.com",
      primaryUserEmail: "user@example.com",
      activeRpmEmail: "rpm@example.com",
    });
    expect(role).toBe("rpm");
    expect(canModifyUserProfile(role)).toBe(false);
    expect(canApproveTransaction(role)).toBe(false);
  });

  it("allows inbound UserProfile edits only from owner or master", () => {
    expect(
      canApplyInboundUserProfileEdit("user", "owner@example.com", "owner@example.com"),
    ).toBe(true);
    expect(
      canApplyInboundUserProfileEdit("user", "other@example.com", "owner@example.com"),
    ).toBe(false);
    expect(canApplyInboundUserProfileEdit("master", "anyone@example.com", "owner@example.com")).toBe(
      true,
    );
    expect(canApplyInboundUserProfileEdit("rpm", "rpm@example.com", "owner@example.com")).toBe(false);
  });

  it("matches UserProfile gate for Assign RPM inbound", () => {
    expect(canAssignProjectRpmViaInbound("user", "owner@example.com", "owner@example.com")).toBe(true);
    expect(canAssignProjectRpmViaInbound("user", "collab@example.com", "owner@example.com")).toBe(false);
    expect(canAssignProjectRpmViaInbound("master", "any@example.com", "owner@example.com")).toBe(true);
    expect(canAssignProjectRpmViaInbound("rpm", "rpm@example.com", "owner@example.com")).toBe(false);
  });
});
