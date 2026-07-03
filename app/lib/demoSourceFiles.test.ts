import { describe, expect, it } from "vitest";
import { normalizeDemoSourceFileUrl } from "./demoSourceFiles";

describe("normalizeDemoSourceFileUrl", () => {
  it("maps legacy example.com sandbox files to local public assets", () => {
    expect(
      normalizeDemoSourceFileUrl("https://example.com/cfsp-sandbox/stroke-warning-signs-learner-roster.pdf")
    ).toBe("/cfsp-sandbox/stroke-warning-signs-learner-roster.pdf");
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
