import { describe, expect, it } from "vitest";

import { formatSpExportName, getSpListExportFilePart } from "./spListExport";

describe("formatSpExportName", () => {
  it("prefers structured first and last name fields", () => {
    expect(formatSpExportName({ firstName: "Jane", lastName: "Doe", displayName: "Jane A. Doe" })).toBe("Doe, Jane");
  });

  it("conservatively parses a simple full name", () => {
    expect(formatSpExportName({ displayName: "John Smith" })).toBe("Smith, John");
  });

  it("keeps multi-word first names when parsing a full name", () => {
    expect(formatSpExportName({ displayName: "Mary Ann Jones" })).toBe("Jones, Mary Ann");
  });

  it("does not mangle names that are already last-name first or have suffixes", () => {
    expect(formatSpExportName({ displayName: "Smith, John" })).toBe("Smith, John");
    expect(formatSpExportName({ displayName: "John Smith Jr." })).toBe("John Smith Jr.");
  });
});

describe("getSpListExportFilePart", () => {
  it("builds a filesystem-friendly export filename segment", () => {
    expect(getSpListExportFilePart("July 28, 2026 / Virtual")).toBe("july-28-2026-virtual");
  });
});
