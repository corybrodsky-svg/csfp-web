import { describe, expect, it } from "vitest";

import {
  buildEventCommandCenterHref,
  getEventOperationsHandoffForIssue,
  normalizeCommandCenterToolKey,
} from "./eventOperationsSummary";

describe("event operations Command Center handoffs", () => {
  it("normalizes supported deep-link tool aliases", () => {
    expect(normalizeCommandCenterToolKey("sp-finder")).toBe("sp-finder");
    expect(normalizeCommandCenterToolKey("schedule-builder")).toBe("schedule");
    expect(normalizeCommandCenterToolKey("case-files")).toBe("materials");
    expect(normalizeCommandCenterToolKey("training-email")).toBe("training-email");
    expect(normalizeCommandCenterToolKey("readiness_checklist")).toBe("readiness");
    expect(normalizeCommandCenterToolKey("unknown-tool")).toBeNull();
  });

  it("builds event tool deep links without writing event state", () => {
    expect(buildEventCommandCenterHref("event 1", "materials")).toBe("/events/event%201?tool=materials");
    expect(buildEventCommandCenterHref("event 1", "training-email")).toBe("/events/event%201?tool=training-email");
    expect(buildEventCommandCenterHref("event 1", "overview")).toBe("/events/event%201");
  });

  it("routes Dashboard issue summaries to the closest Command Center tool", () => {
    expect(getEventOperationsHandoffForIssue("Coverage incomplete").tool).toBe("staffing");
    expect(getEventOperationsHandoffForIssue("3 checked in").tool).toBe("sp-finder");
    expect(getEventOperationsHandoffForIssue("Draft schedule incomplete").tool).toBe("schedule");
    expect(getEventOperationsHandoffForIssue("Learner roster missing").tool).toBe("learner-roster");
    expect(getEventOperationsHandoffForIssue("Case files missing").tool).toBe("materials");
    expect(getEventOperationsHandoffForIssue("Faculty packet not sent").tool).toBe("faculty-contacts");
    expect(getEventOperationsHandoffForIssue("Readiness issue").tool).toBe("readiness");
  });
});
