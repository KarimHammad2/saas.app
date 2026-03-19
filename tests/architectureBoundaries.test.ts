import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("architecture boundaries", () => {
  it("inbound route does not import supabase or repositories", () => {
    const source = read("app/api/inbound/route.ts");
    expect(source).not.toContain("@/lib/supabase");
    expect(source).not.toContain("modules/memory/repository");
    expect(source).not.toContain("src/memory/");
  });

  it("src orchestrator does not import supabase", () => {
    const source = read("src/orchestration/orchestrator.ts");
    expect(source).not.toContain("@/lib/supabase");
  });
});
