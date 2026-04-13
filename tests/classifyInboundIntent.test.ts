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
      expect(result.isGreetingOnly).toBe(true);
      expect(result.confidence).toBeLessThan(0.6);
    });
  });

  describe("returns isNewProjectIntent: false for extremely short messages", () => {
    it("three-word body", () => {
      const result = classifyInboundIntent("Hi", "Hello how are");
      expect(result.isNewProjectIntent).toBe(false);
      expect(result.isGreetingOnly).toBe(true);
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
      expect(result.isGreetingOnly).toBe(false);
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

    it("short clear intent: SaaS for restaurants (regression — previously scored 0.50)", () => {
      const result = classifyInboundIntent(
        "new",
        "I want to build a SaaS for restaurants",
      );
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("short clear intent: I want to create an app for gyms", () => {
      const result = classifyInboundIntent("no subject", "I want to create an app for gyms");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("short clear intent: I'm building a platform for freelancers", () => {
      const result = classifyInboundIntent("no subject", "I'm building a platform for freelancers");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("short clear intent: We're building a marketplace for used cars", () => {
      const result = classifyInboundIntent("no subject", "We're building a marketplace for used cars");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("short clear intent: I'm working on a CRM for clinics", () => {
      const result = classifyInboundIntent("no subject", "I'm working on a CRM for clinics");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("short clear intent: I am working on a scheduling app for salons", () => {
      const result = classifyInboundIntent("no subject", "I am working on a scheduling app for salons");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("regression: I'm working now on AI automation tool like n8n", () => {
      const result = classifyInboundIntent("no subject", "I'm working now on AI automation tool like n8n");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("regression: I am working now on workflow automation for support", () => {
      const result = classifyInboundIntent("no subject", "I am working now on workflow automation for support teams");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("regression: We're working right now on an automation platform", () => {
      const result = classifyInboundIntent("no subject", "We're working right now on an automation platform for agencies");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("direct phrase: start project", () => {
      const result = classifyInboundIntent("no subject", "Please start project for an AI tool that manages support tickets");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("direct phrase: kick off a project", () => {
      const result = classifyInboundIntent("no subject", "Let's kick off a project for a CRM dashboard");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("direct phrase: initialize project", () => {
      const result = classifyInboundIntent("no subject", "Can you initialize project for a website analytics platform?");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("natural language: I'm planning", () => {
      const result = classifyInboundIntent("no subject", "I'm planning a SaaS product for salon scheduling");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("natural language: I need help with", () => {
      const result = classifyInboundIntent("no subject", "I need help with a business automation dashboard for support operations");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("natural language: I'd like to build", () => {
      const result = classifyInboundIntent("no subject", "I'd like to build a website for booking and payments");
      expect(result.isNewProjectIntent).toBe(true);
      expect(result.reason).toContain("strong-override");
    });

    it("keyword signal: AI tool", () => {
      const result = classifyInboundIntent("no subject", "Project idea: AI tool for organizing sales calls");
      expect(result.isNewProjectIntent).toBe(true);
    });

    it("action verb context: setup", () => {
      const result = classifyInboundIntent("no subject", "We need to setup a dashboard for tracking agency KPIs");
      expect(result.isNewProjectIntent).toBe(true);
    });

    it("action verb context: automate", () => {
      const result = classifyInboundIntent("no subject", "I want to automate a CRM workflow for onboarding");
      expect(result.isNewProjectIntent).toBe(true);
    });

    it("action verb context: organize", () => {
      const result = classifyInboundIntent("no subject", "Please organize a project for managing API integrations");
      expect(result.isNewProjectIntent).toBe(true);
    });

    it("action verb context: manage", () => {
      const result = classifyInboundIntent("no subject", "I need a platform to manage business operations");
      expect(result.isNewProjectIntent).toBe(true);
    });

    it("action verb context: track", () => {
      const result = classifyInboundIntent("no subject", "Let's track project milestones in a product dashboard");
      expect(result.isNewProjectIntent).toBe(true);
    });
  });

  describe("strong override does not match vague messages", () => {
    it("I have an idea — still insufficient without explicit build phrasing", () => {
      const result = classifyInboundIntent("no subject", "I have an idea");
      expect(result.isNewProjectIntent).toBe(false);
    });

    it("Something about fitness — too vague / too short", () => {
      const result = classifyInboundIntent("no subject", "Something about fitness");
      expect(result.isNewProjectIntent).toBe(false);
    });

    it("generic start without project context", () => {
      const result = classifyInboundIntent("no subject", "We should start tomorrow morning.");
      expect(result.isNewProjectIntent).toBe(false);
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
