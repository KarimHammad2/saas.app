import { describe, expect, it } from "vitest";
import { generateProjectDocumentDocx } from "@/modules/output/generateProjectDocumentDocx";

const ZIP_MAGIC = "PK\u0003\u0004";

describe("generateProjectDocumentDocx", () => {
  it("returns a non-empty Buffer that starts with the ZIP magic bytes", async () => {
    const buffer = await generateProjectDocumentDocx("# PROJECT FILE\n\nHello world.");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.slice(0, 4).toString("binary")).toBe(ZIP_MAGIC);
  });

  it("produces valid non-empty DOCX output for typical markdown input", async () => {
    const input = [
      "# PROJECT FILE",
      "",
      "## Project Metadata",
      "",
      "- Project Name: Example",
      "- Status: Active",
    ].join("\n");
    const first = await generateProjectDocumentDocx(input);
    const second = await generateProjectDocumentDocx(input);
    expect(first.slice(0, 4).toString("binary")).toBe(ZIP_MAGIC);
    expect(second.slice(0, 4).toString("binary")).toBe(ZIP_MAGIC);
    expect(first.length).toBeGreaterThan(1000);
    expect(Math.abs(first.length - second.length)).toBeLessThan(100);
  });

  it("handles an empty string without throwing", async () => {
    const buffer = await generateProjectDocumentDocx("");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.slice(0, 4).toString("binary")).toBe(ZIP_MAGIC);
  });
});
