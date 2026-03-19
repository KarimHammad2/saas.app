import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const upsert = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn((table: string) => {
  if (table === "project_state") {
    return { select, upsert };
  }
  throw new Error(`Unexpected table ${table}`);
});

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({ from })),
}));

describe("ProjectService.updateProject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    maybeSingle.mockResolvedValue({
      data: {
        state_json: {
          overview: "",
          goals: ["Ship alpha"],
          tasks: ["Draft spec"],
          risks: [],
          notes: [],
          decisions: [],
          timeline: [],
          history: [],
        },
      },
      error: null,
    });
    upsert.mockResolvedValue({ error: null });
  });

  it("merges cumulative state arrays", async () => {
    const { ProjectService } = await import("@/src/memory/project.service");
    const service = new ProjectService();
    await service.updateProject("project_1", {
      goals: ["Ship alpha", "Launch beta"],
      tasks: ["Draft spec", "Set up webhook"],
      risks: ["Timeline risk"],
      notes: ["Kickoff complete"],
      decisions: ["Use Supabase"],
    });

    const upsertArg = upsert.mock.calls[0]?.[0] as { state_json: Record<string, unknown> };
    const state = upsertArg.state_json;

    expect(state.goals).toEqual(["Ship alpha", "Launch beta"]);
    expect(state.tasks).toEqual(["Draft spec", "Set up webhook"]);
    expect(state.risks).toEqual(["Timeline risk"]);
    expect(state.notes).toEqual(["Kickoff complete"]);
    expect(state.decisions).toEqual(["Use Supabase"]);
  });
});
