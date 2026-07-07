import { describe, expect, it } from "vitest";
import {
  buildOpeningOutreachRecipientPayloads,
  editableOpeningPayload,
  getCreateErrorDiagnostics,
  getOpeningIdentityForPayload,
  openingUpdatePayloadFromCreatePayload,
} from "./route";

describe("CFSP open shift offer payloads", () => {
  it("builds the opening insert payload with event, organization, creator, status, count, and timestamps", () => {
    const selectedSpIds = Array.from({ length: 25 }, (_, index) => `sp-${index + 1}`);
    const payload = editableOpeningPayload(
      {
        title: "SP Shift: Neurologic Assessment",
        shift_date: "2026-07-30",
        start_time: "08:00",
        end_time: "10:00",
        needed_count: 6,
        visibility: "portal_and_email",
        contactedSpIds: selectedSpIds,
      },
      "event-123",
      "org-123",
      false,
      "user-123"
    );

    expect(payload).toMatchObject({
      event_id: "event-123",
      organization_id: "org-123",
      created_by: "user-123",
      status: "open",
      needed_count: 6,
      selected_count: 25,
      visibility: "portal_and_email",
      title: "SP Shift: Neurologic Assessment",
      shift_date: "2026-07-30",
      start_time: "08:00",
      end_time: "10:00",
    });
    expect(payload.created_at).toEqual(expect.any(String));
    expect(payload.updated_at).toEqual(expect.any(String));
  });

  it("uses the event schedule and outreach scope as the idempotency identity", () => {
    const basePayload = editableOpeningPayload(
      {
        title: "SP Shift: Neurologic Assessment",
        shift_date: "2026-07-30",
        start_time: "08:00:00",
        end_time: "10:00:00",
        location: "Main Campus",
        room: "Room 1",
        needed_count: 6,
        visibility: "portal_and_email",
        notes: [
          "Event: Neurologic Assessment",
          "[CFSP_SHIFT_POLL_METADATA]",
          "pollMethod: cfsp",
          "cfspPollStatus: sent",
          "cfspSelectedSpIds: sp-1%2Csp-2",
          "[/CFSP_SHIFT_POLL_METADATA]",
        ].join("\n"),
        contactedSpIds: ["sp-1", "sp-2"],
      },
      "event-123",
      "org-123",
      false,
      "user-123"
    );
    const repeatPayload = {
      ...basePayload,
      id: "opening-existing",
      title: "Updated title from repeat click",
      notes: String(basePayload.notes).replace("cfspPollStatus: sent", "cfspPollStatus: ready"),
      selected_count: 25,
      created_at: "2026-07-07T12:00:00.000Z",
      updated_at: "2026-07-07T12:03:00.000Z",
    };

    expect(getOpeningIdentityForPayload(repeatPayload)).toBe(getOpeningIdentityForPayload(basePayload));
  });

  it("builds an idempotent update payload without changing immutable ownership fields", () => {
    const insertPayload = editableOpeningPayload(
      {
        title: "SP Shift: Neurologic Assessment",
        shift_date: "2026-07-30",
        start_time: "08:00",
        end_time: "10:00",
        needed_count: 6,
        selected_count: 25,
      },
      "event-123",
      "org-123",
      false,
      "user-123"
    );
    const updatePayload = openingUpdatePayloadFromCreatePayload(insertPayload);

    expect(updatePayload).toMatchObject({
      title: "SP Shift: Neurologic Assessment",
      shift_date: "2026-07-30",
      start_time: "08:00",
      end_time: "10:00",
      needed_count: 6,
      selected_count: 25,
    });
    expect(updatePayload).not.toHaveProperty("event_id");
    expect(updatePayload).not.toHaveProperty("organization_id");
    expect(updatePayload).not.toHaveProperty("created_by");
    expect(updatePayload).not.toHaveProperty("created_at");
    expect(updatePayload.updated_at).toEqual(expect.any(String));
  });

  it("builds one outreach recipient row per selected SP with event, opening, organization, creator, and timestamps", () => {
    const selectedSpIds = Array.from({ length: 25 }, (_, index) => `sp-${index + 1}`);
    const rows = buildOpeningOutreachRecipientPayloads({
      eventId: "event-123",
      openingId: "opening-123",
      spIds: selectedSpIds,
      organizationId: "org-123",
      userId: "user-123",
      sourceValue: "email",
      now: "2026-07-07T12:00:00.000Z",
    });

    expect(rows).toHaveLength(25);
    expect(rows[0]).toMatchObject({
      event_id: "event-123",
      opening_id: "opening-123",
      sp_id: "sp-1",
      organization_id: "org-123",
      created_by: "user-123",
      response: "no_response",
      source: "email",
      responded_at: null,
      created_at: "2026-07-07T12:00:00.000Z",
      updated_at: "2026-07-07T12:00:00.000Z",
    });
    expect(rows[24]).toMatchObject({
      event_id: "event-123",
      opening_id: "opening-123",
      sp_id: "sp-25",
      organization_id: "org-123",
      created_by: "user-123",
    });
  });

  it("returns actionable operation/table/supabase diagnostics for create failures", () => {
    const diagnostics = getCreateErrorDiagnostics(
      {
        message: "new row violates row-level security policy for table event_shift_responses",
        code: "42501",
        details: "RLS check failed",
        hint: "Check cfsp_shift_responses_insert",
      },
      "insert_outreach_recipients",
      "event_shift_responses",
      {
        selectedSpCount: 25,
        selectedEmailCount: 25,
        rlsMode: "user_scoped_rls",
      }
    );

    expect(diagnostics).toMatchObject({
      operation: "insert_outreach_recipients",
      table: "event_shift_responses",
      selectedSpCount: 25,
      selectedEmailCount: 25,
      rlsMode: "user_scoped_rls",
      supabase: {
        message: "new row violates row-level security policy for table event_shift_responses",
        code: "42501",
        details: "RLS check failed",
        hint: "Check cfsp_shift_responses_insert",
      },
    });
  });
});
