import { describe, expect, it } from "vitest";

import {
  filterDashboardEventsForActiveOrganization,
  getDashboardEventListScopeDiagnostics,
} from "./route";
import { relatedRowBelongsToAuthorizedEventScope } from "./[id]/route";

describe("dashboard event organization scoping", () => {
  const events = [
    { id: "keystone-1", organization_id: "keystone-org" },
    { id: "cicsp-1", organization_id: "cicsp-org" },
    { id: "legacy-1", organization_id: null },
    { id: "legacy-2" },
  ];

  it("returns only Keystone events when Keystone is the active organization", () => {
    expect(filterDashboardEventsForActiveOrganization(events, "keystone-org").map((event) => event.id)).toEqual([
      "keystone-1",
    ]);
  });

  it("returns only CICSP events when CICSP is the active organization", () => {
    expect(filterDashboardEventsForActiveOrganization(events, "cicsp-org").map((event) => event.id)).toEqual([
      "cicsp-1",
    ]);
  });

  it("does not include null-org legacy events in normal dashboard scope", () => {
    const scoped = filterDashboardEventsForActiveOrganization(events, "keystone-org");
    expect(scoped.some((event) => !event.organization_id)).toBe(false);

    const diagnostics = getDashboardEventListScopeDiagnostics(scoped, "keystone-org", false);
    expect(diagnostics.nullOrgEventCount).toBe(0);
    expect(diagnostics.legacyNullInclusionUsed).toBe(false);
    expect(diagnostics.outOfScopeEventCount).toBe(0);
  });
});

describe("event detail related-row legacy fallback", () => {
  it("allows null-org related rows only for the authorized event id", () => {
    expect(
      relatedRowBelongsToAuthorizedEventScope(
        { event_id: "event-1", organization_id: null },
        "event-1",
        "keystone-org"
      )
    ).toBe(true);
  });

  it("does not leak unrelated null-org related rows into event detail", () => {
    expect(
      relatedRowBelongsToAuthorizedEventScope(
        { event_id: "other-event", organization_id: null },
        "event-1",
        "keystone-org"
      )
    ).toBe(false);
  });

  it("does not include related rows from another organization", () => {
    expect(
      relatedRowBelongsToAuthorizedEventScope(
        { event_id: "event-1", organization_id: "cicsp-org" },
        "event-1",
        "keystone-org"
      )
    ).toBe(false);
  });
});
