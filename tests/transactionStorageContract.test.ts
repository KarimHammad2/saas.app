import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Regression guard: each inbound transaction must INSERT a new row and ADD project remainder
 * to the project's balance (never overwrite prior transactions or replace history).
 */
describe("transaction storage contract (migration SQL)", () => {
  it("store_transaction_event_atomic inserts a transaction and increments project remainder_balance", () => {
    const sql = readFileSync(
      join(repoRoot, "supabase/migrations/20260422_000030_transaction_payment_links.sql"),
      "utf8",
    );
    expect(sql).toMatch(/insert into public\.transactions/i);
    expect(sql).toMatch(
      /remainder_balance\s*=\s*coalesce\(current_remainder,\s*0\)\s*\+\s*coalesce\(p_project_remainder,\s*0\)/i,
    );
  });
});
