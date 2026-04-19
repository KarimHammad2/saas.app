import { describe, expect, it } from "vitest";
import { applyTierFinancials } from "@/modules/domain/financial";
import { getNextTier } from "@/modules/domain/pricing";
import {
  canApplyInboundUserProfileEdit,
  canApproveTransaction,
  canModifyUserProfile,
  resolveActorRole,
} from "@/modules/domain/rbac";

describe("domain logic", () => {
  it("transitions freemium to solopreneur on transaction", () => {
    const tier = getNextTier({
      currentTier: "freemium",
      hasTransactionEvent: true,
      totalAccountEmails: 1,
    });
    expect(tier).toBe("solopreneur");
  });

  it("transitions to agency when multiple account emails exist", () => {
    const tier = getNextTier({
      currentTier: "solopreneur",
      hasTransactionEvent: false,
      totalAccountEmails: 2,
    });
    expect(tier).toBe("agency");
  });

  it("normalizes transaction fields deterministically without split assumptions", () => {
    const event = applyTierFinancials(
      {
        hoursPurchased: 20,
        hourlyRate: 50,
        allocatedHours: 0,
        bufferHours: 0,
        saas2Fee: 0,
        projectRemainder: 0,
      },
      "solopreneur",
    );

    expect(event.bufferHours).toBe(0);
    expect(event.allocatedHours).toBe(0);
    expect(event.saas2Fee).toBe(0);
    expect(event.projectRemainder).toBe(0);
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
});
