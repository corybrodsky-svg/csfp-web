import { describe, expect, it } from "vitest";
import { normalizeDemoSourceFileUrl } from "./demoSourceFiles";

describe("normalizeDemoSourceFileUrl", () => {
  it("maps legacy example.com learner roster placeholders to the sample roster template", () => {
    expect(
      normalizeDemoSourceFileUrl("https://example.com/cfsp-sandbox/stroke-warning-signs-learner-roster.pdf")
    ).toBe("/cfsp-sandbox/cfsp-sandbox-student-roster-template.xlsx");
  });

  it("maps legacy learner roster material routes to the sample roster template", () => {
    expect(normalizeDemoSourceFileUrl("/api/sandbox-materials/stroke-warning-signs-learner-roster")).toBe(
      "/cfsp-sandbox/cfsp-sandbox-student-roster-template.xlsx"
    );
  });

  it("maps legacy sandbox material API routes to local PDF assets", () => {
    expect(normalizeDemoSourceFileUrl("/api/sandbox-materials/stroke-warning-signs-sp-case-brief")).toBe(
      "/cfsp-sandbox/stroke-warning-signs-sp-case-brief.pdf"
    );
  });

  it("suppresses non-sandbox example.com placeholders", () => {
    expect(normalizeDemoSourceFileUrl("https://example.com/missing-demo-file.pdf")).toBe("");
  });

  it("preserves uploaded or external non-placeholder URLs", () => {
    expect(normalizeDemoSourceFileUrl("https://storage.example.test/event-file.pdf")).toBe(
      "https://storage.example.test/event-file.pdf"
    );
  });
});
