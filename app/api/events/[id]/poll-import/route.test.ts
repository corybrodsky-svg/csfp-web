import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const mockState = vi.hoisted(() => ({
  assignments: [] as Array<{ id: string; sp_id: string | null; notes: string | null }>,
  eventNotes: "",
  eventUpdates: [] as Array<Record<string, unknown>>,
  sps: [] as Array<Record<string, unknown>>,
  supabase: null as unknown,
}));

vi.mock("../../../../lib/organizationAuth", () => ({
  applyOrganizationAuthCookies: (response: Response) => response,
  createSupabaseUserClient: vi.fn(() => mockState.supabase),
  forbiddenJson: (error: string) => Response.json({ ok: false, error }, { status: 403 }),
  getOrganizationContext: vi.fn(async () => ({
    accessToken: "test-token",
    activeOrganization: { id: "org-1" },
    isPlatformOwner: false,
    legacyRole: null,
    role: "sim_ops",
    schemaAvailable: false,
    user: { id: "user-1" },
  })),
  noActiveOrganizationJson: () => Response.json({ ok: false, error: "No active organization." }, { status: 400 }),
  requireActiveOrganization: vi.fn(() => true),
  roleCanOperateOrganization: vi.fn(() => true),
  unauthorizedJson: () => Response.json({ ok: false, error: "Unauthorized." }, { status: 401 }),
}));

vi.mock("../../../../lib/supabaseAdminClient", () => ({
  createSupabaseAdminClient: vi.fn(() => mockState.supabase),
}));

import { POST } from "./route";

function createSupabaseMock() {
  return {
    from(table: string) {
      if (table === "events") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "event-1", notes: mockState.eventNotes }, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            mockState.eventUpdates.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }

      if (table === "sps") {
        return {
          select: () => ({
            limit: async () => ({ data: mockState.sps, error: null }),
          }),
        };
      }

      if (table === "event_sps") {
        return {
          select: () => ({
            eq: async () => ({ data: mockState.assignments, error: null }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function createWorkbookFile(rows: Array<Record<string, unknown>>, name = "poll-results.xlsx") {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new File([data], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function postPollFile(file: File) {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await POST(
    { formData: async () => formData } as Request,
    { params: Promise.resolve({ id: "event-1" }) }
  );

  return {
    response,
    body: await response.json(),
  };
}

beforeEach(() => {
  mockState.assignments = [];
  mockState.eventNotes = "";
  mockState.eventUpdates = [];
  mockState.sps = [
    { id: "sp-1", first_name: "Legacy", last_name: "One", full_name: "Legacy One", working_email: null, email: "legacy@example.com" },
    { id: "sp-2", first_name: "Pat", last_name: "Export", full_name: "Pat Export", working_email: null, email: "pat@example.com" },
    { id: "sp-3", first_name: "Riley", last_name: "Later", full_name: "Riley Later", working_email: null, email: "riley@example.com" },
  ];
  mockState.supabase = createSupabaseMock();
});

describe("MS Forms poll import", () => {
  it("imports legacy exact headers", async () => {
    const { response, body } = await postPollFile(
      createWorkbookFile([
        {
          "Finish time": "2026-06-04T09:21:00.000Z",
          "SP Name": "Legacy One",
          "SP Email": "legacy@example.com",
          "Training Availability": "Available",
          "Event Availability": "Available",
          Notes: "Ready to work.",
        },
      ])
    );

    expect(response.status).toBe(200);
    expect(body.importedPollResponses).toHaveLength(1);
    expect(body.importedPollResponses[0]).toMatchObject({
      email: "legacy@example.com",
      responseStatus: "available",
      responseCompletedAt: "2026-06-04T09:21:00.000Z",
      responseNote: "Ready to work.",
    });
  });

  it("imports Microsoft Forms answer aliases, long availability questions, and no notes column", async () => {
    const trainingQuestion =
      "Are you available for the SP TRAINING for this event on Tuesday, July 28th, 2026 from 9:00am to 10:00am?";
    const eventQuestion = "Are you available for this event on Tuesday, July 28th, 2026 from 1:00pm to 5:30pm?";

    const { response, body } = await postPollFile(
      createWorkbookFile([
        {
          ID: "2",
          "Start time": "6/4/26 9:22:00",
          "Completion time": "6/4/26 9:22:30",
          Email: "anonymous",
          Name: "",
          [trainingQuestion]: "Available",
          [eventQuestion]: "Available",
          "Full name": "Pat Export",
          "Enter your email address": "pat@example.com",
          "Do you have a laptop or desktop computer to participate in this virtual case?": "Yes",
        },
        {
          ID: "1",
          "Start time": "6/4/26 9:21:00",
          "Completion time": "6/4/26 9:21:30",
          Email: "anonymous",
          Name: "",
          [trainingQuestion]: "Available",
          [eventQuestion]: "Available",
          "Full name": "Legacy One",
          "Enter your email address": "legacy@example.com",
          "Do you have a laptop or desktop computer to participate in this virtual case?": "Yes",
        },
      ])
    );

    expect(response.status).toBe(200);
    expect(body.debug).toMatchObject({
      matchedCompletionTimeHeader: "Completion time",
      matchedEmailHeader: "Enter your email address",
      matchedNameHeader: "Full name",
      matchedTrainingResponseHeader: trainingQuestion,
      matchedEventResponseHeader: eventQuestion,
      matchedNotesHeader: "",
    });
    expect(body.importedPollResponses.map((entry: { email: string }) => entry.email)).toEqual([
      "legacy@example.com",
      "pat@example.com",
    ]);
    expect(body.importedPollResponses[1]).toMatchObject({
      responseNote: "",
      responseStatus: "available",
    });
  });

  it("keeps the latest duplicate email response without crashing", async () => {
    const { response, body } = await postPollFile(
      createWorkbookFile([
        {
          "Completion time": "2026-06-04T09:20:00.000Z",
          "Full name": "Riley Later",
          "Enter your email address": "riley@example.com",
          "Training Availability": "Not available",
          "Event Availability": "Not available",
        },
        {
          "Completion time": "2026-06-04T09:30:00.000Z",
          "Full name": "Riley Later",
          "Enter your email address": "riley@example.com",
          "Training Availability": "Available",
          "Event Availability": "Available",
        },
      ])
    );

    expect(response.status).toBe(200);
    expect(body.importedPollResponses).toHaveLength(1);
    expect(body.importedPollResponses[0]).toMatchObject({
      email: "riley@example.com",
      responseCompletedAt: "2026-06-04T09:30:00.000Z",
      responseStatus: "available",
    });
  });

  it("does not recommend training-available responders who are unavailable for the event day", async () => {
    const { response, body } = await postPollFile(
      createWorkbookFile([
        {
          "Completion time": "2026-06-04T09:20:00.000Z",
          "Full name": "Sandy Venuti",
          "Enter your email address": "sandy@example.com",
          "Training Availability": "Available",
          "Event Availability": "Not available",
          Notes: "1",
        },
      ])
    );

    expect(response.status).toBe(200);
    expect(body.importedPollResponses).toHaveLength(1);
    expect(body.importedPollResponses[0]).toMatchObject({
      email: "sandy@example.com",
      responseStatus: "maybe",
      responseLabel: "Needs review",
      rawAnswer: "Available | Not available | 1",
    });
  });

  it("treats training-only availability as needs review instead of event availability", async () => {
    const { response, body } = await postPollFile(
      createWorkbookFile([
        {
          "Completion time": "2026-06-04T09:20:00.000Z",
          "Full name": "Training Only",
          "Enter your email address": "training-only@example.com",
          "Training Availability": "Available",
        },
      ])
    );

    expect(response.status).toBe(200);
    expect(body.importedPollResponses[0]).toMatchObject({
      email: "training-only@example.com",
      responseStatus: "maybe",
      responseLabel: "Needs review",
    });
  });

  it("classifies combined available and not-available answers as needs review", async () => {
    const { response, body } = await postPollFile(
      createWorkbookFile([
        {
          "Completion time": "2026-06-04T09:20:00.000Z",
          "Full name": "Conflicted One",
          "Enter your email address": "conflicted@example.com",
          Availability: "Available | Not available | 1",
        },
      ])
    );

    expect(response.status).toBe(200);
    expect(body.importedPollResponses[0]).toMatchObject({
      email: "conflicted@example.com",
      responseStatus: "maybe",
      responseLabel: "Needs review",
      rawAnswer: "Available | Not available | 1",
    });
  });

  it("includes detected headers and missing fields when no responder rows parse", async () => {
    const { response, body } = await postPollFile(
      createWorkbookFile([
        {
          "Completion time": "2026-06-04T09:20:00.000Z",
          "Are you available for this event?": "Available",
        },
      ])
    );

    expect(response.status).toBe(400);
    expect(body.error).toContain("Found headers: Completion time, Are you available for this event?");
    expect(body.error).toContain("Missing required fields: SP name column, SP email column");
  });
});
