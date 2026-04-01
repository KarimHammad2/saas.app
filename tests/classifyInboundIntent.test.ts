import { describe, expect, it } from "vitest";
import { classifyInboundIntent } from "@/modules/orchestration/classifyInboundIntent";

describe("classifyInboundIntent", () => {
  describe("returns isNewProjectIntent: false for vague / greeting messages", () => {
    it.each([
      ["Hello", "Hello"],
      ["Hi", "Hi there!"],
      ["Hey", "Hey"],
      ["no subject", "Thanks"],
      ["no subject", "Thank you"],
      ["no subject", "Ok"],
      ["no subject", "okay"],
      ["no subject", "noted"],
      ["no subject", "got it"],
      ["no subject", "test"],
      ["no subject", "testing"],
      ["no subject", "test email"],
      ["no subject", "checking in"],
      ["no subject", "just checking"],
      ["no subject", "following up"],
      ["no subject", "touching base"],
    ])('subject=%j body=%j', (subject, body) => {
      const result = classifyInboundIntent(subject, body);
      expect(result.isNewProjectIntent).toBe(false);
      expect(result.confidence).toBeLessThan(0.6);
    });
  });

  describe("returns isNewProjectIntent: false for extremely short messages", () => {
    it("three-word body", () => {
      const result = classifyInboundIntent("Hi", "Hello how are");
      expect(result.isNewProjectIntent).toBe(false);
      expect(result.confidence).toBeLessThan(0.6);
    });
  });

  describe("returns isNewProjectIntent: true for clear project descriptions", () => {
    it("explicit build intent", () => {
      const result = classifyInboundIntent(
        "New project idea",
        "I want to build a SaaS app for invoice tracking for small businesses.",
      );
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it("building keyword in body", () => {
      const result = classifyInboundIntent(
        "Project kickoff",
        "I'm building a marketplace for freelance designers and need help planning the MVP.",
      );
      expect(result.isNewProjectIntent).toBe(true);
    });

    it("'help me build' pattern", () => {
      const result = classifyInboundIntent(
        "Request",
        "Can you help me build a mobile app for my restaurant that handles online reservations?",
      );
      expect(result.isNewProjectIntent).toBe(true);
    });

    it("long substantive body with enough context to infer project", () => {
      const longBody =
        "We are a small team of three engineers and we have been working on a tool that helps " +
        "e-commerce stores automatically generate discount codes based on customer behaviour. " +
        "We need someone to help us structure the roadmap and track progress over the next quarter.";
      const result = classifyInboundIntent("Update", longBody);
      expect(result.isNewProjectIntent).toBe(true);
    });

    it("startup idea keyword in subject", () => {
      const result = classifyInboundIntent(
        "Startup idea",
        "We're launching a new platform for remote team collaboration tools.",
      );
      expect(result.isNewProjectIntent).toBe(true);
    });
  });

  describe("confidence boundaries", () => {
    it("single project keyword alone does not reach threshold without word count", () => {
      // Short body with one keyword — pattern hit (0.25) + short body (<10 words, +0) = 0.25 < 0.6
      const result = classifyInboundIntent("SaaS", "SaaS");
      expect(result.isNewProjectIntent).toBe(false);
    });

    it("multiple keyword hits cross the threshold", () => {
      const result = classifyInboundIntent(
        "New project",
        "I want to build a SaaS MVP marketplace app.",
      );
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe("reason field", () => {
    it("includes a reason string", () => {
      const result = classifyInboundIntent("Hello", "Hello");
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });
});
