import { describe, expect, it } from "vitest";
import { parseCcMembershipDecision } from "@/modules/domain/ccMembershipDecision";

describe("parseCcMembershipDecision", () => {
  it("accepts common affirmative confirmations", () => {
    expect(parseCcMembershipDecision("ok, go ahead")).toBe("approve");
    expect(parseCcMembershipDecision("Sounds good - please do")).toBe("approve");
    expect(parseCcMembershipDecision("confirmed")).toBe("approve");
  });

  it("keeps rejection precedence over mixed text", () => {
    expect(parseCcMembershipDecision("no, do not add them")).toBe("reject");
  });
});
