import { describe, expect, it } from "vitest";
import { filterParticipantEmailsByEntitlements, resolvePlanEntitlements } from "@/modules/domain/entitlements";

describe("resolvePlanEntitlements", () => {
  it("maps freemium/solopreneur to solo package", () => {
    expect(resolvePlanEntitlements("freemium").package).toBe("solo");
    expect(resolvePlanEntitlements("solopreneur").package).toBe("solo");
  });

  it("maps agency tier to agency package with collaborators", () => {
    const entitlements = resolvePlanEntitlements("agency");
    expect(entitlements.package).toBe("agency");
    expect(entitlements.allowCollaborators).toBe(true);
  });

  it("disables human oversight on freemium", () => {
    expect(resolvePlanEntitlements("freemium").allowHumanOversight).toBe(false);
    expect(resolvePlanEntitlements("solopreneur").allowHumanOversight).toBe(true);
  });
});

describe("filterParticipantEmailsByEntitlements", () => {
  it("blocks adding new collaborators for solo package", () => {
    const filtered = filterParticipantEmailsByEntitlements({
      candidateEmails: ["owner@example.com", "collab@example.com"],
      existingParticipantEmails: [],
      ownerEmail: "owner@example.com",
      activeRpmEmail: "rpm@example.com",
      entitlements: resolvePlanEntitlements("solopreneur"),
    });
    expect(filtered).toEqual(["owner@example.com"]);
  });

  it("allows collaborator additions for agency package", () => {
    const filtered = filterParticipantEmailsByEntitlements({
      candidateEmails: ["owner@example.com", "collab@example.com"],
      existingParticipantEmails: [],
      ownerEmail: "owner@example.com",
      activeRpmEmail: "rpm@example.com",
      entitlements: resolvePlanEntitlements("agency"),
    });
    expect(filtered).toEqual(["owner@example.com", "collab@example.com"]);
  });
});
